/*  
 *  solver.js
 *  
 *  Copyright 2015 Gilbert Bernstein
 *  Copyright 2015 Adobe Systems Inc.
 *  
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  
 *      http://www.apache.org/licenses/LICENSE-2.0
 *  
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

(function(on_node){
var exports = on_node? module.exports : window['solver']={};

// modules
if(on_node) {
  var primitives = require('./primitives');
  var linalg     = require('./linalg');
} else {
  var primitives = window.primitives;
  var linalg     = window.linalg;
  if(!primitives || !linalg)
    throw new Error(
      "Must have Primitives and LinAlg Modules loaded before Solver");
}

var Vec2 = primitives.Vec2
var Scalar = primitives.Scalar;
var DenseVector = linalg.DenseVector;
var SparseMatrix = linalg.SparseMatrix;


var Solver        = (exports.Solver = {});


function get_sig() { return Date.now() + Math.random(); }

Solver.New = function() {
  var slv           = Object.create(Solver);
  slv.clear();
  return slv;
}

Solver.clear = function() {
  this._constraints  = [];
  this._penalties    = [];
  this._scalars      = [];
  this._signature    = get_sig();
  this._comp_data    = null;
}
Solver.isCompiled = function() {
  return !!this._comp_data;
}

Solver.checkSignature = function(scalar) {
  return scalar._solver_sig === this._signature;
}
Solver.addVariable = function(s) {
  if(this.isCompiled())
    throw new Error('Cannot add a variable to compiled solve');
  // guard to prevent adding twice
  if(!this.checkSignature(s)) {
    s._solver_sig = this._signature;
    var idx = this._scalars.length;
    this._scalars[idx] = s;
    s._solver_idx = idx;
  }
}
Solver.addVariables = function(ss) {
  if(this.isCompiled())
    throw new Error('Cannot add variables to compiled solve');
  var slv = this;
  for(var k=0; k<ss.length; k++)
    slv.addVariable(ss[k]);
}

Solver.addConstraint = function(c) {
  if(this.isCompiled())
    throw new Error('Cannot add a constraint to compiled solve');
  this._constraints.push(c);
  this.addVariables(c.variables());
}
Solver.addConstraints = function(cs) {
  if(this.isCompiled())
    throw new Error('Cannot add constraints to compiled solve');
  var slv = this;
  for(var k=0; k<cs.length; k++)
    slv.addConstraint(cs[k]);
}

Solver.addPenalty = function(p) {
  if(this.isCompiled())
    throw new Error('Cannot add a penalty to compiled solve');
  this._penalties.push(p);
  this.addVariables(p.variables());
}




Solver.compile = function() {
  if(this.isCompiled())
    throw new Error('Cannot compile an already compiled solve');

  // cache constraint metadata
  var n_vars        = this._scalars.length;
  var n_constraints = 0;
  var norm_counts   = DenseVector.New(n_vars); norm_counts.zero();
  this._constraints.forEach(function(c) {
    c.saveIndices();
    n_constraints += c.numEquations();
    c.countIndices(norm_counts);
  });
  var normvec = norm_counts.data;
  for(var k=0; k<n_vars; k++) normvec[k] = 1/normvec[k];

  // SAVE COMPILED DATA
  this._comp_data = {
    n_vars:             n_vars,
    n_constraints:      n_constraints,
    norm_counts:        norm_counts,
  };
}

Solver.loadPosition = function() {
  var pos = DenseVector.New(
    this._scalars.map(function(s) { return s.get(); }));
  return pos;
}
Solver.storePosition = function(pos) {
  var n_vars = this._scalars.length;
  for(var k=0; k<n_vars; k++)
    this._scalars[k].set(pos.data[k]);
}
Solver._base_load_constraint_jacobian = function(init_pos) {
  var n_vars              = this._comp_data.n_vars;
  var n_constraints       = this._comp_data.n_constraints;
  var constraint_jacobian = SparseMatrix.New(n_constraints, n_vars);
  var constraint_i = 0;
  for(var iter=0; iter<this._constraints.length; iter++) {
    var c = this._constraints[iter];

    c.writeJacobian(constraint_jacobian, constraint_i, init_pos);
    constraint_i += c.numEquations();
  }
  return constraint_jacobian;
}
Solver.loadConstraintJacobian = function(init_pos) {
  var jacobian = this._base_load_constraint_jacobian(init_pos);
  jacobian.rowcompress();
  return jacobian;
}
Solver.loadConstraintJacobianTranspose = function(init_pos) {
  var jacobian = this._base_load_constraint_jacobian(init_pos);
  jacobian.transpose();
  jacobian.rowcompress();
  return jacobian;
}


function common_system_solve_call(lm, J, RHS) {
  var max_iters = 50; // was running in much less
  var residual_cutoff = 0.0001;
  var regularization = 0.0001;
  return linalg.conjgrad_solve_AAtx(
    lm, // output
    J, RHS, // input
    max_iters, residual_cutoff, regularization // params
  );
}
Solver.projectVectorOntoConstraints = function(vec, jacobian) {
  var n_vars        = this._comp_data.n_vars;
  var n_constraints = this._comp_data.n_constraints;
  // ---------------------
  // compute rhs
  var rhs = DenseVector.New(n_constraints);
  rhs.set_mat_vec(jacobian, vec);
  rhs.negate();

  // ---------------------
  // solve for Lagrange multipliers
  var lagrange_multipliers = DenseVector.New(n_constraints);

  // Linear System Solve
  common_system_solve_call(lagrange_multipliers, jacobian, rhs);

  // ---------------------
  // given lagrange multipliers, project the vector by
  // removing the orthogonal component
  var constrained_vec = DenseVector.New(n_vars);
      constrained_vec.copyFrom(vec);
  constrained_vec.acc_mat_T_vec(jacobian, lagrange_multipliers);
  return constrained_vec;
}

Solver.enforceConstraintsViaGradient = function(pos) {
  var n_vars        = this._comp_data.n_vars;
  var norm_counts   = this._comp_data.norm_counts;
  var grad          = DenseVector.New(n_vars);
  //var gradmax       = DenseVector.New(n_vars);

  var gradvec       = grad.data;
  //var maxvec        = gradmax.data;
  var normvec       = norm_counts.data;
  var posvec        = pos.data;

  //var maxerr        = 0;

  var step_size = 0.49; // This is a crude tool here.  Can do better...
  var num_steps = 50;
  //var num_steps = 1;
  for(var step_counter = 0; step_counter<num_steps; step_counter++) {
    grad.zero();
    //gradmax.zero();
    //maxerr = 0;
    // do a step
    for(var iter=0; iter<this._constraints.length; iter++) {
      var c = this._constraints[iter];

      c.accumulateEnforcementGradient(step_size, grad, pos);

      //var violation = c.violationDistance(pos);
      //maxerr = Math.max(maxerr, violation);
      //// sum maximum distance the point might move
      //for(var ki=0; ki<c._indices.length; ki++) {
      //  maxvec[c._indices[ki]] = Math.max(maxvec[c._indices[ki]], violation);
      //  //maxvec[c._indices[ki]] += violation;
      //}
    }
    //var max_overshoot_factor = 1;
    //for(var k=0; k<n_vars; k++) {
    //  var overshoot = gradvec[k] / ((maxvec[k] < 1e-8)? 1e-8 : maxvec[k]);
    //  max_overshoot_factor = Math.max(max_overshoot_factor, overshoot);
    //}
    //var scale = 1/max_overshoot_factor;
    // apply the step
    for(var k=0; k<n_vars; k++) {
      // non-uniform gradient downscaling to avoid overshooting due to too many
      // different constraints acting simultaneously on a single coordinate
      //posvec[k]  += gradvec[k] * scale;
      posvec[k]  += gradvec[k] * normvec[k];
    }
  }
  //console.log('gradient err', maxerr);
}

Solver.debugForcesOnPoint = function(pt) {
  if(!this.isCompiled()) this.compile();
  var n_vars        = this._comp_data.n_vars;

  var init_pos = this.loadPosition();

  var xi = pt.x()._solver_idx;
  var yi = pt.y()._solver_idx;

  var scratch = DenseVector.New(n_vars); scratch.zero();

  // ---------------------
  // solve for constraint seeking force
  var step_size = 0.45; // gonna rescale for display anyway...

  var forces = [];
  for(var iter=0; iter<this._constraints.length; iter++) {
    var c = this._constraints[iter];
    // skip irrelevant constraints
    if(!c.hasIndex(xi) && !c.hasIndex(yi)) continue;

    // read out the force for this constraint
    scratch.zero();
    c.accumulateEnforcementGradient(step_size, scratch, init_pos);
    forces.push({
      force: [ scratch.data[xi], scratch.data[yi] ],
      constraint: c,
    });
  }

  return forces;
}

Solver.debugResponseToForceField = function(forces) {
  var the_solver = this;
  if(!the_solver.isCompiled()) this.compile();
  var n_vars = this._comp_data.n_vars;

  // ---------------------
  // marshall/compute data relevant to this particular position
  var init_pos              = this.loadPosition();
  var constraint_jacobian   = this.loadConstraintJacobian(init_pos);

  // ---------------------
  // COMPILE THE FORCES INTO A VECTOR
  var ideal_force = DenseVector.New(n_vars);  ideal_force.zero();
  var fdata = ideal_force.data;
  forces.forEach(function(f) {
    var i = f.scalar._solver_idx;
    fdata[i] += f.force;
  });

  // ---------------------
  // Solve for Lagrange Multipliers
  var n_constraints = this._comp_data.n_constraints;
  // compute rhs
  var rhs = DenseVector.New(n_constraints);
  rhs.set_mat_vec(constraint_jacobian, ideal_force);
  rhs.negate();

  // ---------------------
  // solve for Lagrange multipliers
  var lagrange_multipliers = DenseVector.New(n_constraints);

  // Linear System Solve
  var solve_stats =
    common_system_solve_call(lagrange_multipliers, constraint_jacobian, rhs);
  debug.solve_stats = solve_stats;

  // TODO: output information about the solve
  //console.log('debugResponseToForceField; ', 'iterations')

  // now we want to collect the constraint maintenance forces
  var forces = []; for(var k=0; k<n_vars; k++) forces[k] = [];
  var r=0;
  this._constraints.forEach(function(constraint) {
    var nrows = constraint.numEquations();
    var collect = []; // aggregate rows by column for constraint
    while(nrows > 0) {
      var lm = lagrange_multipliers.data[r];

      var start = constraint_jacobian.rowstart[r];
      var end   = constraint_jacobian.rowstart[r+1];
      for(var k=start; k<end; k++) {
        var c = constraint_jacobian.colidx[k];
        var v = constraint_jacobian.data[k];

        if(!collect[c])
          collect[c] = { force: 0, constraint: constraint };
        collect[c].force += v*lm;
      }

      nrows--; r++;
    }
    // store observed values now
    for(var c in collect) {
      if(collect.hasOwnProperty(c) && Math.abs(collect[c].force) > 1e-3)
        forces[c].push(collect[c]);
    }
  });

  debug.forces_from_field = forces;
  return forces;
}


Solver.solveForceField = function(forces) {
  var the_solver = this;
  if(!this.isCompiled()) this.compile();
  var n_vars = this._comp_data.n_vars;

  // ---------------------
  // marshall/compute data relevant to this particular position
  var init_pos              = this.loadPosition();
  var constraint_jacobian   = this.loadConstraintJacobian(init_pos);

  // ---------------------
  // COMPILE THE FORCES INTO A VECTOR
  var ideal_force = DenseVector.New(n_vars);  ideal_force.zero();
  var fdata = ideal_force.data;
  forces.forEach(function(f) {
    if(!the_solver.checkSignature(f.scalar)) throw new Error(
      'Cannot set forces on a variable that\'s not part of this solve'+
      ' (current sig: '+the_solver._signature+' ;'+
      ' variable sig: '+f.scalar._signature+')'
    );

    var i = f.scalar._solver_idx;
    fdata[i] += f.force;
  });

  // ----------------------
  // project the "force" vector...
  var constrained_force =
    this.projectVectorOntoConstraints(ideal_force, constraint_jacobian);
  //constrained_force = ideal_force;

  // apply this update
  //var total_update  = constrained_force; // re-use
  var pos           = init_pos; // re-use
  pos.acc_vec(constrained_force);

  // ---------------------
  // Use the gradient of constraints to snap to the constraint manifold
  this.enforceConstraintsViaGradient(pos);
  this.storePosition(pos);
}


})(typeof window === 'undefined');
