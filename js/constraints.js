/*  
 *  constraints.js
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
var exports = on_node? module.exports : window['constraints']={};

// modules
if(on_node) {
  var primitives = require('./primitives');
  var linalg     = require('./linalg');
} else {
  var primitives = window.primitives;
  var linalg     = window.linalg;
  if(!primitives || !linalg)
    throw new Error(
      "Must have Primitives and LinAlg Modules loaded before Constraints");
}

var Vec2 = primitives.Vec2
var Scalar = primitives.Scalar;
var SparseMatrix = linalg.SparseMatrix;


var Equation      = (exports.Equation = {});
var Constraint    = (exports.Constraint = Object.create(Equation));
var Penalty       = (exports.Penalty    = Object.create(Equation));



// that a point is defined as a particular sample from a Bezier Curve
var BzSample      = (exports.BzSample       = Object.create(Constraint));
                  BzSample._display_name    = 'BzSample';
// that a point is defined as a particular sample from an Arc
var ArcSample     = (exports.ArcSample      = Object.create(Constraint));
                  ArcSample._display_name   = 'ArcSample';
// that a point lies on the bisector line of two other points
var Bisector      = (exports.Bisector       = Object.create(Constraint));
                  Bisector._display_name    = 'Bisector';
// constrain the weight parameter of the Rational Bezier representing an Arc
var ArcWeight     = (exports.ArcWeight      = Object.create(Constraint));
                  ArcWeight._display_name   = 'ArcWeight';
// that 3 points are colinear
var Colinear      = (exports.Colinear       = Object.create(Constraint));
                  Colinear._display_name    = 'Colinear';
// that the height of a triangle is as specified
var TriHeight     = (exports.TriHeight      = Object.create(Constraint));
                  TriHeight._display_name   = 'TriHeight';
// that 4 points are cocircular
//var Cocircular    = (exports.Cocircular = Object.create(Constraint));
// the two points should have identical coordinates
var EqualPt       = (exports.EqualPt        = Object.create(Constraint));
                  EqualPt._display_name     = 'EqualPt';
// the two numbers should be identical
var EqualNum      = (exports.EqualNum       = Object.create(Constraint));
                  EqualNum._display_name    = 'EqualNum';
// the point should lie on the given circle
var OnCircle      = (exports.OnCircle       = Object.create(Constraint));
                  OnCircle._display_name    = 'OnCircle';
// average distance of a point set from a center point should be = R
var AvgRadius     = (exports.AvgRadius      = Object.create(Constraint));
                  AvgRadius._display_name   = 'AvgRadius';
// average of some list of numbers should be 
var Average       = (exports.Average        = Object.create(Constraint));
                  Average._display_name     = 'Average';


Constraint.countIndices = function(count_vec) {
  var cvec = count_vec.data;
  for(var k=0; k<this._indices.length; k++)
    cvec[this._indices[k]] += 1;
}
Constraint.hasIndex = function(idx) {
  for(var k=0; k<this._indices.length; k++)
    if(this._indices[k] === idx)
      return true;
  return false;
}



// -------------------------------------------------------------------------

BzSample.New = function(bz, pt, t) {
  var c = Object.create(BzSample);
  c._bz = bz;
  c._pt = pt;
  c._tval = t;
  var t1 = 1-t;
  c._coeffs = [
    t1*t1*t1,
    3*t1*t1*t,
    3*t1*t*t,
    t*t*t
  ];

  return c;
}
BzSample.numEquations = function() { return 2; }
BzSample.variables = function() {
  var bz = this._bz;
  var vs = [
    bz.p(0).x(),
    bz.p(0).y(),
    bz.p(1).x(),
    bz.p(1).y(),
    bz.p(2).x(),
    bz.p(2).y(),
    bz.p(3).x(),
    bz.p(3).y(),
    this._pt.x(),
    this._pt.y(),
  ];
  return vs;
}
BzSample.saveIndices = function() {
  var bz = this._bz;
  var i = (this._named_indices = {
    bz0x: bz.p(0).x()._solver_idx,
    bz0y: bz.p(0).y()._solver_idx,
    bz1x: bz.p(1).x()._solver_idx,
    bz1y: bz.p(1).y()._solver_idx,
    bz2x: bz.p(2).x()._solver_idx,
    bz2y: bz.p(2).y()._solver_idx,
    bz3x: bz.p(3).x()._solver_idx,
    bz3y: bz.p(3).y()._solver_idx,
    ptx:  this._pt.x()._solver_idx,
    pty:  this._pt.y()._solver_idx,
  });
  this._indices = [i.bz0x, i.bz0y, i.bz1x, i.bz1y, i.bz2x, i.bz2y,
                   i.bz3x, i.bz3y, i.ptx, i.pty];
}
function bezier_sample_eval(posvec, i, cs) {
  var bzx = 0;
  var bzy = 0;
  bzx += cs[0] * posvec[i.bz0x];
  bzy += cs[0] * posvec[i.bz0y];
  bzx += cs[1] * posvec[i.bz1x];
  bzy += cs[1] * posvec[i.bz1y];
  bzx += cs[2] * posvec[i.bz2x];
  bzy += cs[2] * posvec[i.bz2y];
  bzx += cs[3] * posvec[i.bz3x];
  bzy += cs[3] * posvec[i.bz3y];

  var diffx = bzx - posvec[i.ptx];
  var diffy = bzy - posvec[i.pty];

  return [diffx,diffy];
}
BzSample.violationDistance = function(pos) {
  var i = this._named_indices;
  var cs = this._coeffs;
  
  // measure deviation from zero
  var diffeval = bezier_sample_eval(pos.data, i, cs);
  var diffx = diffeval[0];
  var diffy = diffeval[1];

  return Math.max(Math.abs(diffx), Math.abs(diffy));
}
BzSample.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var i = this._named_indices;
  var cs = this._coeffs;
  
  // measure deviation from zero
  var diffeval = bezier_sample_eval(pos.data, i, cs);
  var diffx = diffeval[0];
  var diffy = diffeval[1];

  // now run that backwards into a gradient update
  // values have been negated to move in the right update direction
  var gradvec = grad.data;
  gradvec[i.bz0x] -= step_size * cs[0] * diffx;
  gradvec[i.bz0y] -= step_size * cs[0] * diffy;
  gradvec[i.bz1x] -= step_size * cs[1] * diffx;
  gradvec[i.bz1y] -= step_size * cs[1] * diffy;
  gradvec[i.bz2x] -= step_size * cs[2] * diffx;
  gradvec[i.bz2y] -= step_size * cs[2] * diffy;
  gradvec[i.bz3x] -= step_size * cs[3] * diffx;
  gradvec[i.bz3y] -= step_size * cs[3] * diffy;

  gradvec[i.ptx] += step_size * diffx;
  gradvec[i.pty] += step_size * diffy;
}
BzSample.writeJacobian = function(jacobian, row_i, pos) {
  var xrow = row_i;
  var yrow = row_i+1;
  var posvec = pos.data;

  var i = this._named_indices;
  var cs = this._coeffs;

  jacobian.write(xrow, i.bz0x, cs[0]);
  jacobian.write(yrow, i.bz0y, cs[0]);
  jacobian.write(xrow, i.bz1x, cs[1]);
  jacobian.write(yrow, i.bz1y, cs[1]);
  jacobian.write(xrow, i.bz2x, cs[2]);
  jacobian.write(yrow, i.bz2y, cs[2]);
  jacobian.write(xrow, i.bz3x, cs[3]);
  jacobian.write(yrow, i.bz3y, cs[3]);

  jacobian.write(xrow, i.ptx, -1);
  jacobian.write(yrow, i.pty, -1);
}

// -------------------------------------------------------------------------

ArcSample.New = function(arc, pt, t) {
  var c = Object.create(ArcSample);
  c._arc  = arc;
  c._pt   = pt;
  c._tval = t;
  var t1  = 1-t;
  c._coeffs = [
    t1*t1,
    2*t1*t,
    t*t
  ];

  return c;
}
ArcSample.numEquations = function() { return 2; }
ArcSample.variables = function() {
  var arc = this._arc;
  var vs = [
    arc.p(0).x(),
    arc.p(0).y(),
    arc.p(1).x(),
    arc.p(1).y(),
    arc.p(2).x(),
    arc.p(2).y(),
    arc.w(),
    this._pt.x(),
    this._pt.y(),
  ];
  return vs;
}
ArcSample.saveIndices = function() {
  var arc = this._arc;
  var i = (this._named_indices = {
    p0x: arc.p(0).x()._solver_idx,
    p0y: arc.p(0).y()._solver_idx,
    p1x: arc.p(1).x()._solver_idx,
    p1y: arc.p(1).y()._solver_idx,
    p2x: arc.p(2).x()._solver_idx,
    p2y: arc.p(2).y()._solver_idx,
    w:   arc.w()._solver_idx,
    sx:  this._pt.x()._solver_idx,
    sy:  this._pt.y()._solver_idx,
  });
  this._indices = [i.p0x, i.p0y, i.p1x, i.p1y, i.p2x, i.p2y,
                   //i.w, // left out because not used in gradient update
                   i.sx, i.sy];
}
function arc_sample_eval_constants(posvec, i, cs) {
  // weight & normalization factor
  var w = posvec[i.w];
  var norm = cs[0] + w*cs[1] + cs[2];
  var invnorm = 1.0/norm; // useful to only do once

  // normed coefficients
  var ncs = [
    cs[0] * invnorm,
    cs[1] * w * invnorm,
    cs[2] * invnorm,
  ];
  return [w, invnorm, ncs];
}
function arc_sample_ideal_point_eval(posvec, i, ncs) {
  var ax = 0;
  var ay = 0;
  ax += ncs[0] * posvec[i.p0x];
  ay += ncs[0] * posvec[i.p0y];
  ax += ncs[1] * posvec[i.p1x];
  ay += ncs[1] * posvec[i.p1y];
  ax += ncs[2] * posvec[i.p2x];
  ay += ncs[2] * posvec[i.p2y];

  return [ax,ay];
}
ArcSample.violationDistance = function(pos) {
  var i = this._named_indices;
  var cs = this._coeffs;
  var posvec = pos.data;

  // do some common computation of constants
  var constants = arc_sample_eval_constants(posvec,i,cs);
  var w = constants[0];
  var invnorm = constants[1];
  var ncs = constants[2];

  // measure deviation from zero
  var ideal = arc_sample_ideal_point_eval(posvec, i, ncs);
  var dx = ideal[0] - posvec[i.sx];
  var dy = ideal[1] - posvec[i.sy];

  return Math.max(Math.abs(dx), Math.abs(dy));
}
ArcSample.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var i = this._named_indices;
  var cs = this._coeffs;
  var posvec = pos.data;

  // do some common computation of constants
  var constants = arc_sample_eval_constants(posvec,i,cs);
  var w = constants[0];
  var invnorm = constants[1];
  var ncs = constants[2];

  // measure deviation from zero
  var ideal = arc_sample_ideal_point_eval(posvec, i, ncs);
  var dx = ideal[0] - posvec[i.sx];
  var dy = ideal[1] - posvec[i.sy];

  // now run that backwards into a gradient update
  // values have been negated to move in the right update direction
  var gradvec = grad.data;
  gradvec[i.p0x] -= step_size * ncs[0] * dx;
  gradvec[i.p0y] -= step_size * ncs[0] * dy;
  gradvec[i.p1x] -= step_size * ncs[1] * dx;
  gradvec[i.p1y] -= step_size * ncs[1] * dy;
  gradvec[i.p2x] -= step_size * ncs[2] * dx;
  gradvec[i.p2y] -= step_size * ncs[2] * dy;

  gradvec[i.sx] += step_size * dx;
  gradvec[i.sy] += step_size * dy;

  // the adjustment for w is complicated.  I'm going to try
  // leaving it out because I'm not convinced it's needed to maintain
  // the sample constraint.
  //var d1x = posvec[i.p1x] - posvec[i.sx];
  //var d1y = posvec[i.p1y] - posvec[i.sy];
  //var q = cs[1]*invnorm;
  //gradvec[i.w] -= step_size * q * (d1x*dx + d1y*dy);
}
ArcSample.writeJacobian = function(jacobian, row_i, pos) {
  var xrow = row_i;
  var yrow = row_i+1;
  var posvec = pos.data;

  var i = this._named_indices;
  var cs = this._coeffs;

  // do some shared computation of constants
  var constants = arc_sample_eval_constants(posvec,i,cs);
  var w = constants[0];
  var invnorm = constants[1];
  var ncs = constants[2];
  var ideal = arc_sample_ideal_point_eval(posvec, i, ncs);

  jacobian.write(xrow, i.p0x, ncs[0]);
  jacobian.write(yrow, i.p0y, ncs[0]);
  jacobian.write(xrow, i.p1x, ncs[1]);
  jacobian.write(yrow, i.p1y, ncs[1]);
  jacobian.write(xrow, i.p2x, ncs[2]);
  jacobian.write(yrow, i.p2y, ncs[2]);

  jacobian.write(xrow, i.sx, -1);
  jacobian.write(yrow, i.sy, -1);

  // definitely need all the partial derivatives correctly in the Jacobian
  var d1x = posvec[i.p1x] - posvec[i.sx];
  var d1y = posvec[i.p1y] - posvec[i.sy];
  var q = cs[1]*invnorm;
  jacobian.write(xrow, i.w, q * d1x);
  jacobian.write(yrow, i.w, q * d1y);
}


// -------------------------------------------------------------------------


Bisector.New = function(p0, p1, mid) {
  var c = Object.create(Bisector);
  c._p0 = p0;
  c._p1 = p1;
  c._mid = mid;
  return c;
}
Bisector.numEquations = function() { return 1; }
Bisector.variables = function() {
  return [
    this._p0.x(), this._p0.y(),
    this._p1.x(), this._p1.y(),
    this._mid.x(), this._mid.y(),
  ];
}
Bisector.saveIndices = function() {
  var i = (this._named_indices = {
    p0x:  this._p0.x()._solver_idx,
    p0y:  this._p0.y()._solver_idx,
    p1x:  this._p1.x()._solver_idx,
    p1y:  this._p1.y()._solver_idx,
    midx: this._mid.x()._solver_idx,
    midy: this._mid.y()._solver_idx,
  });
  this._indices = [i.p0x, i.p0y, i.p1x, i.p1y, i.midx, i.midy];
}
function bisector_edges(posvec, i) {
  var p0  = [posvec[i.p0x],  posvec[i.p0y]];
  var p1  = [posvec[i.p1x],  posvec[i.p1y]];
  var mid = [posvec[i.midx], posvec[i.midy]];
  return [
    Vec2.sub(p1,p0),
    Vec2.sub(p0,mid),
    Vec2.sub(p1,mid),
  ];
}
Bisector.violationDistance = function(pos) {
  var posvec  = pos.data;

  var i = this._named_indices;
  var edges = bisector_edges(posvec, i);
  var e01 = edges[0];
  var em0 = edges[1];
  var em1 = edges[2];

  var projDiff = Vec2.dot(e01,em0) + Vec2.dot(e01,em1);
  var len01 = Vec2.len(e01);
  if(len01 < 1e-5) len01 = 1e-5;
  // this is the distance one of the endpoints might have to move
  return Math.abs(projDiff)/len01;
}
// we derive this constraint by projecting triangle edges onto a baseline
// and ensuring that the projections are equal and opposite in magnitude
Bisector.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;

  var i = this._named_indices;
  var edges = bisector_edges(posvec, i);
  var e01 = edges[0];
  var em0 = edges[1];
  var em1 = edges[2];

  var eval = Vec2.dot(e01,em0) + Vec2.dot(e01,em1);
  // dividing by the squared base length will
  // make the midpoint move by exactly the deviating amount
  var len01 = Vec2.len2(e01);
  if(len01 < 1e-5) len01 = 1e-5; // clamping only decreases effective step
  var scale = eval / len01;

  gradvec[i.p0x]  -= step_size * scale * -em0[0];
  gradvec[i.p0y]  -= step_size * scale * -em0[1];
  gradvec[i.p1x]  -= step_size * scale *  em1[0];
  gradvec[i.p1y]  -= step_size * scale *  em1[1];
  gradvec[i.midx] -= step_size * scale * -e01[0];
  gradvec[i.midy] -= step_size * scale * -e01[1];
}
Bisector.writeJacobian = function(jacobian, row_i, pos) {
  var posvec  = pos.data;

  var i = this._named_indices;
  var edges = bisector_edges(posvec, i);
  var e01 = edges[0];
  var em0 = edges[1];
  var em1 = edges[2];

  // dividing by the base length will
  // bring all the values written into the O(1) range
  var len01 = Vec2.len(e01);
  if(len01 < 1e-4) len01 = 1e-4; // clamping only decreases effective step
  var scale = 1.0 / len01;

  jacobian.write(row_i, i.p0x,  -em0[0] * scale);
  jacobian.write(row_i, i.p0y,  -em0[1] * scale);
  jacobian.write(row_i, i.p1x,   em1[0] * scale);
  jacobian.write(row_i, i.p1y,   em1[1] * scale);
  jacobian.write(row_i, i.midx, -e01[0] * scale);
  jacobian.write(row_i, i.midy, -e01[1] * scale);
}
//Bisector.test = function(p0, p1, mid, eps) {
//}


// -------------------------------------------------------------------------


ArcWeight.New = function(arc) {
  var c = Object.create(ArcWeight);
  c._arc  = arc;
  return c;
}
ArcWeight.numEquations = function() { return 2; }
ArcWeight.variables = function() {
  var arc = this._arc;
  var vs = [
    arc.p(0).x(),
    arc.p(0).y(),
    arc.p(1).x(),
    arc.p(1).y(),
    arc.p(2).x(),
    arc.p(2).y(),
    arc.w(),
  ];
  return vs;
}
ArcWeight.saveIndices = function() {
  var arc = this._arc;
  var i = (this._named_indices = {
    p0x: arc.p(0).x()._solver_idx,
    p0y: arc.p(0).y()._solver_idx,
    p1x: arc.p(1).x()._solver_idx,
    p1y: arc.p(1).y()._solver_idx,
    p2x: arc.p(2).x()._solver_idx,
    p2y: arc.p(2).y()._solver_idx,
    w:   arc.w()._solver_idx,
  });
  this._indices = [i.p0x, i.p0y, i.p1x, i.p1y, i.p2x, i.p2y, i.w];
}
// This equation is difficult to derive but the key idea is that
// if you take the angle theta subtended by P1-P0 and P1-P2, then 
//      **    w_1 = SIN(theta/2)    ** (this is the key equation)
// one derivation of the above can be found here: http://www.cs.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/NURBS/RB-circles.html
// Given the above equation
// and a diagram of the arc, we get the equation
//    (||P2-P1|| + ||P0-P1||) * w_1 = ||P2-P0||
// since ||P2-P0||/2 is the side of a right triangle opposite Theta,
// and since (||P2-P1|| + ||P0-P1||)/2 is
// a symmetric estimate of the hypoteneuse.
// Thus
//    C = ||P2-P0|| - w_1 * (||P2-P1|| + ||P0-P1||)
// ( note: D[||v||] = v/||v|| * D[v] )
//  Let e02 = P2-P0, e10 = P0-P1, e12 = P2-P1
//      E02 = ||e02||, n02 = e02/E02, etc.
// D[C] = D[||e02||] - D[w_1] * (E10+E12) - w_1*D[||e10||] - w_1*D[||e12||]
//      =       n02 * D[e02] - (E10+E12) * D[w_1]
//        - w_1*n10 * D[e10] -   w_1*n12 * D[e12]
// dC/dp0 = -n02 - w_1*n10
// dC/dp2 =  n02 - w_1*n12
// dC/dp1 = w_1 * (n10+n12)
// dC/dw  = -(E10 + E12)
function arc_w_eval_edges(posvec, i) {
  var p0 = [ posvec[i.p0x], posvec[i.p0y] ];
  var p1 = [ posvec[i.p1x], posvec[i.p1y] ];
  var p2 = [ posvec[i.p2x], posvec[i.p2y] ];
  var e02 = Vec2.sub(p2, p0);
  var e12 = Vec2.sub(p2, p1);
  var e10 = Vec2.sub(p0, p1);
  var len02 = Vec2.len(e02);
  var len12 = Vec2.len(e12);
  var len10 = Vec2.len(e10);
  // clamping only leads to smaller normals than expected
  // which only produces smaller effective gradient steps
  var n02 = Vec2.mul( 1.0 / ((len02 < 1e-4)? 1e-4 : len02),
                      e02 );
  var n12 = Vec2.mul( 1.0 / ((len12 < 1e-4)? 1e-4 : len12),
                      e12 );
  var n10 = Vec2.mul( 1.0 / ((len10 < 1e-4)? 1e-4 : len10),
                      e10 );
  return [ len10, len12, len02, n10, n12, n02 ];
}
function arc_w_eval(edges, w) {
  var E10 = edges[0];
  var E12 = edges[1];
  var E02 = edges[2];
  return E02 - w * (E10 + E12);
}
ArcWeight.violationDistance = function(pos) {
  var posvec  = pos.data;
  var i = this._named_indices;

  // how much the points would need to move to satisfy the current weight
  // (approximately?) Does this cause huge problems with different
  // orders of magnitude?
  var w = posvec[i.w];
  var edges = arc_w_eval_edges(posvec, i);
  var diff = arc_w_eval(edges, w);
  return diff;
}
ArcWeight.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec = pos.data;
  var gradvec = grad.data;
  var i = this._named_indices;

  var w = posvec[i.w];
  var edges = arc_w_eval_edges(posvec, i);
  var E10 = edges[0];
  var E12 = edges[1];
  var E02 = edges[2];
  var N10 = edges[3];
  var N12 = edges[4];
  var N02 = edges[5];

  var diff = arc_w_eval(edges, w);
  // scale to make sure we're making an update to w on a reasonable scale
  // clamping can only decrease scale value
  var denom = (E10+E12 < 1e-4)? 1e-8 : (E10+E12)*(E10+E12);
  //var denom = (E10+E12 < 1e-4)? 1e-4 : (E10+E12);
  var scale = diff / denom;

  gradvec[i.p0x] -= step_size * (-N02[0] - w * N10[0] ) * scale;
  gradvec[i.p0y] -= step_size * (-N02[1] - w * N10[1] ) * scale;
  gradvec[i.p1x] -= step_size * (w * (N10[0] + N12[0])) * scale;
  gradvec[i.p1y] -= step_size * (w * (N10[1] + N12[1])) * scale;
  gradvec[i.p2x] -= step_size * ( N02[0] - w * N12[0] ) * scale;
  gradvec[i.p2y] -= step_size * ( N02[1] - w * N12[1] ) * scale;

  gradvec[i.w]   -= step_size * -(E10 + E12) * scale;
}
// dC/dp0 = -n02 - w_1*n10
// dC/dp2 =  n02 - w_1*n12
// dC/dp1 = w_1 * (n10+n12)
// dC/dw  = -(E10 + E12)
ArcWeight.writeJacobian = function(jacobian, row_i, pos) {
  var posvec = pos.data;
  var i = this._named_indices;

  var w = posvec[i.w];
  var edges = arc_w_eval_edges(posvec, i);
  var E10 = edges[0];
  var E12 = edges[1];
  var E02 = edges[2];
  var N10 = edges[3];
  var N12 = edges[4];
  var N02 = edges[5];

  var denom = (E10+E12 < 1e-4)? 1e-4 : (E10+E12);
  var scale = 1/denom;

  jacobian.write(row_i, i.p0x, (-N02[0] - w * N10[0] ) * scale );
  jacobian.write(row_i, i.p0y, (-N02[1] - w * N10[1] ) * scale );
  jacobian.write(row_i, i.p1x, (w * (N10[0] + N12[0])) * scale );
  jacobian.write(row_i, i.p1y, (w * (N10[1] + N12[1])) * scale );
  jacobian.write(row_i, i.p2x, ( N02[0] - w * N12[0] ) * scale );
  jacobian.write(row_i, i.p2y, ( N02[1] - w * N12[1] ) * scale );

  jacobian.write(row_i, i.w, -(E12 + E10) * scale);
}


// -------------------------------------------------------------------------


Colinear.New = function(p0, p1, p2) {
  var c = Object.create(Colinear);
  c._p = [p0,p1,p2];
  return c;
}
Colinear.numEquations = function() { return 1; }
Colinear.variables = function() {
  var p = this._p;
  var vs = [];
  for(var k=0; k<3; k++) {
    vs[2*k    ] = p[k].x();
    vs[2*k + 1] = p[k].y();
  }
  return vs;
}
Colinear.saveIndices = function() {
  this._x_indices = [];
  this._y_indices = [];
  this._indices = [];
  for(var k=0; k<3; k++) {
    this._x_indices[k] = this._p[k].x()._solver_idx;
    this._y_indices[k] = this._p[k].y()._solver_idx;
    this._indices[2*k]   = this._x_indices[k];
    this._indices[2*k+1] = this._y_indices[k];
  }
}
// C = DET[p1-p0;p2-p0] = 0 is the numeric constraint
// derivatives...
// first, general derivative
// DC = D[(x1-x0)*(y2-y0) - (y1-y0)*(x2-x0)]
//    =   D[x1-x0]*(y2-y0) + D[y2-y0]*(x1-x0)
//      - D[y1-y0]*(x2-x0) - D[x2-x0]*(y1-y0)
// so, we can substitute d/dx1, d/dy0, etc. for D and get the partials
//    dC/dx0 = -(y2-y0) + (y1-y0) = y1-y2
//    dC/dy0 = -(x1-x0) + (x2-x0) = x2-x1
//    dC/dx1 =                    = y2-y0
//    dC/dy1 =                    = x0-x2
//    dC/dx2 =                    = y0-y1
//    dC/dy2 =                    = x1-x0
function colinear_eval(x, y) {
  // compute diffs
  var d1x = x[1] - x[0];
  var d1y = y[1] - y[0];
  var d2x = x[2] - x[0];
  var d2y = y[2] - y[0];
  // compute determinant
  return d1x * d2y - d1y * d2x;
}
Colinear.violationDistance = function(pos) {
  var posvec  = pos.data;

  var xi = this._x_indices;
  var yi = this._y_indices;
  var x = [ posvec[xi[0]], posvec[xi[1]], posvec[xi[2]] ];
  var y = [ posvec[yi[0]], posvec[yi[1]], posvec[yi[2]] ];

  var det = colinear_eval(x,y);

  // e[i] is opposite vertex i
  var ex = [ x[2] - x[1], x[0] - x[2], x[1] - x[0] ];
  var ey = [ y[2] - y[1], y[0] - y[2], y[1] - y[0] ];

  var max_len2 = 0;
  for(var k=0; k<3; k++)
    max_len2 = Math.max(max_len2, ex[k]*ex[k] + ey[k]*ey[k]);

  // dividing by the longest side of the triangle, then we have the
  // distance all the points need to move to satisfy the constraint
  var dist_to_line = det / ((max_len2 < 1e-8)? 1e-8 : max_len2);
  return Math.abs(dist_to_line);
}
Colinear.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;

  var xi = this._x_indices;
  var yi = this._y_indices;
  var x = [ posvec[xi[0]], posvec[xi[1]], posvec[xi[2]] ];
  var y = [ posvec[yi[0]], posvec[yi[1]], posvec[yi[2]] ];

  var det = colinear_eval(x,y);

  // e[i] is opposite vertex i
  var ex = [ x[2] - x[1], x[0] - x[2], x[1] - x[0] ];
  var ey = [ y[2] - y[1], y[0] - y[2], y[1] - y[0] ];

  var max_len2 = 0;
  for(var k=0; k<3; k++)
    max_len2 = Math.max(max_len2, ex[k]*ex[k] + ey[k]*ey[k]);
  // clamping will only decrease the effective scale
  var scale = det / ((max_len2 < 1e-8)? 1e-8 : max_len2);

  for(var k=0; k<3; k++) {
    var rotx  = -ey[k];
    var roty  =  ex[k];

    gradvec[xi[k]] -= step_size * scale * rotx;
    gradvec[yi[k]] -= step_size * scale * roty;
  }
}
Colinear.writeJacobian = function(jacobian, row_i, pos) {
  var posvec = pos.data;

  var xi = this._x_indices;
  var yi = this._y_indices;
  var x = [ posvec[xi[0]], posvec[xi[1]], posvec[xi[2]] ];
  var y = [ posvec[yi[0]], posvec[yi[1]], posvec[yi[2]] ];
  var ex = [ x[2] - x[1], x[0] - x[2], x[1] - x[0] ];
  var ey = [ y[2] - y[1], y[0] - y[2], y[1] - y[0] ];

  var max_len = 0;
  for(var k=0; k<3; k++)
    max_len = Math.max(max_len, Math.sqrt(ex[k]*ex[k] + ey[k]*ey[k]));
  // clamping will only decrease the effective scale
  var scale = 1.0 / ((max_len < 1e-4)? 1e-4 : max_len);

  jacobian.write(row_i, xi[0], scale * -ey[0] );
  jacobian.write(row_i, yi[0], scale *  ex[0] );
  jacobian.write(row_i, xi[1], scale * -ey[1] );
  jacobian.write(row_i, yi[1], scale *  ex[1] );
  jacobian.write(row_i, xi[2], scale * -ey[2] );
  jacobian.write(row_i, yi[2], scale *  ex[2] );
}
// how close to colinear are these points?
// sin_eps is the sin of the cutoff angle; len_eps the minimum scale
Colinear.test = function(p0, p1, p2, sin_eps) {
  var x = [ p0.x().get(), p1.x().get(), p2.x().get() ];
  var y = [ p0.y().get(), p1.y().get(), p2.y().get() ];

  var max_len2 = 0;
  for(var k=0; k<3; k++) {
    var ex = x[(k+1)%3] - x[k];
    var ey = y[(k+1)%3] - y[k];
    max_len2 = Math.max(max_len2, ex*ex + ey*ey);
  }

  return Math.abs(colinear_eval(x,y)) < sin_eps*max_len2;
}


// -------------------------------------------------------------------------


TriHeight.New = function(b0, b1, a, h) {
  var c = Object.create(TriHeight);
  c._b0 = b0;
  c._b1 = b1;
  c._a  = a;
  c._h  = h;
  return c;
}
TriHeight.numEquations = function() { return 1; }
TriHeight.variables = function() {
  return [
    this._b0.x(), this._b0.y(),
    this._b1.x(), this._b1.y(),
    this._a.x(),  this._a.y(),
    this._h,
  ]
}
TriHeight.saveIndices = function() {
  this._indices = [
    this._b0.x()._solver_idx,   this._b0.y()._solver_idx,
    this._b1.x()._solver_idx,   this._b1.y()._solver_idx,
    this._a.x()._solver_idx,    this._a.y()._solver_idx,
    this._h._solver_idx,
  ];
}
// LET b = b1-b0 and r = a - b0
// LET mh = DET[b;r] / |b|  (the measured height)
// C = DET[b;r] / |b| - h = 0
//  when |b| < E, use
// AC = DET[b;r]/E - h = 0
// D[DET] = D[bx*ry - by*rx]
//        =   D[b1x-b0x]*ry + D[ay-b0y]*bx
//          - D[b1y-b0y]*rx - D[ax-b0x]*by
// D[||]  = -1/2 * 1/|| * 2 * b * D[b1-b0]
//        = b/|b| * D[b1-b0]
// DC = D[ DET / || - h ]
//    = (D[DET] - D[||]*mh)/|| - D[h]
// DAC = D[DET]/E - D[h]
// 
//   dC/db0x = (-(ay-b1y) + bx/|| * mh)/||
//   dC/db0y = ( (ax-b1x) + by/|| * mh)/||
//  dAC/db0x = -(ay-b1y)/E
//  dAC/db0y =  (ax-b1x)/E
//   dC/db1x = ( (ay-b0y) - bx/|| * mh)/||
//   dC/db1y = (-(ax-b0x) - by/|| * mh)/||
//  dAC/db1x =  (ay-b0y)/E
//  dAC/db1y = -(ax-b0x)/E
// NOTE NOTE: These expressions for dC/db really just result in
// a vector pointed perpendicular to the base, with length equal to
// the projection of the opposite side onto the base.
// THIS MEANS that triangles whose apex is not over the base will
// tend to twist to make this the case.  However, this can lead to large
// numbers so it could be rather unstable... (How do we normalize this?)
//   dC/dax  = -by/||
//   dC/day  =  bx/||
//  dAC/dax  = -by/E
//  dAC/day  =  bx/E
//   dC/dh   = -1
//  dAC/dh   = -1
// How should we normalize?  dh is fine. da is fine.
//  db0 is ok-ish, except that the twist could be very violent.
// If the apex is over the base, then the twist scaling of the two
// base points should sum to 1.  If the apex is not over the base, they
// should sum to 1 still, but one of the two numbers will be negative.
// If one of the numbers is negative, we'll take the larger of the two
// numbers and scale it down until it's less than 1 in magnitude.
function tri_height_partial_eval(posvec, indices) {
  var b0x = posvec[indices[0]];
  var b0y = posvec[indices[1]];
  var b1x = posvec[indices[2]];
  var b1y = posvec[indices[3]];
  var ax  = posvec[indices[4]];
  var ay  = posvec[indices[5]];

  var base    = [ b1x-b0x, b1y-b0y ];
  var baselen = Vec2.len(base);
  var nbase   = Vec2.mul(1/baselen, base);
  var e0      = [ ax-b0x, ay-b0y ];
  var e1      = [ ax-b1x, ay-b1y ];
  var eavg    = [ ax-0.5*(b0x+b1x), ay-0.5*(b0y+b1y) ];
  var det     = Vec2.cross(base,eavg);
  var mh      = det/baselen;

  return [base, baselen, nbase, e0, e1, eavg, det, mh];
}
var tri_height_div0_eps = 1e-5;
TriHeight.violationDistance = function(pos) {
  var posvec  = pos.data;
  var idx     = this._indices;

  var h       = posvec[idx[6]];
  var partial = tri_height_partial_eval(posvec, idx)
  var base    = partial[0];
  var baselen = partial[1];
  var nbase   = partial[2];
  var e0      = partial[3];
  var e1      = partial[4];
  var eavg    = partial[5];
  var det     = partial[6];
  var mh      = partial[7];

  if(baselen < tri_height_div0_eps) {
    var E = tri_height_div0_eps;
    return Math.abs(det / E - h);
  } else {
    return Math.abs(mh - h);
  }
}
TriHeight.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;
  var idx     = this._indices;

  var h       = posvec[idx[6]];
  var partial = tri_height_partial_eval(posvec, idx)
  var base    = partial[0];
  var baselen = partial[1];
  var nbase   = partial[2];
  var e0      = partial[3];
  var e1      = partial[4];
  var eavg    = partial[5];
  var det     = partial[6];
  var mh      = partial[7];

  if(baselen < tri_height_div0_eps) {
    var E = tri_height_div0_eps;
    var invE = 1/E;
    var diff = det*invE - h;
    var maxlen2 = Math.max(baselen*baselen,
                           Math.max(Vec2.len2(e0), Vec2.len2(e1)));
    var scale = diff / ( (maxlen2 < 1e-8)? 1e-8 : maxlen2 );

    gradvec[idx[0]] -= step_size * scale * -e1[1]*invE;
    gradvec[idx[1]] -= step_size * scale *  e1[0]*invE;
    gradvec[idx[2]] -= step_size * scale *  e0[1]*invE;
    gradvec[idx[3]] -= step_size * scale * -e0[0]*invE;
    gradvec[idx[4]] -= step_size * scale * -base[1]*invE;
    gradvec[idx[5]] -= step_size * scale *  base[0]*invE;
    gradvec[idx[6]] -= step_size * scale * -1;

  } else {
    var invbaselen = 1/baselen;
    var diff = mh - h;

    var b0displace = [ (-e1[1] + nbase[0]*mh) * invbaselen, 
                       ( e1[0] + nbase[1]*mh) * invbaselen ];
    var b1displace = [ ( e0[1] - nbase[0]*mh) * invbaselen, 
                       (-e0[0] - nbase[1]*mh) * invbaselen ];
    var maxlen2 = Math.max(Vec2.len2(b0displace), Vec2.len2(b1displace))
        maxlen2 = Math.max(1, maxlen2); // no need to modify if < 1
    var scale = diff / maxlen2;
    // This rescaling prevents large oscilation due to the base twisting

    gradvec[idx[0]] -= step_size * scale * b0displace[0];
    gradvec[idx[1]] -= step_size * scale * b0displace[1];
    gradvec[idx[2]] -= step_size * scale * b1displace[0];
    gradvec[idx[3]] -= step_size * scale * b1displace[1];
    gradvec[idx[4]] -= step_size * scale * -nbase[1];
    gradvec[idx[5]] -= step_size * scale *  nbase[0];
    gradvec[idx[6]] -= step_size * scale * -1;
  }
}
TriHeight.writeJacobian = function(jacobian, row_i, pos) {
  var posvec = pos.data;
  var idx    = this._indices;

  var h       = posvec[idx[6]];
  var partial = tri_height_partial_eval(posvec, idx)
  var base    = partial[0];
  var baselen = partial[1];
  var nbase   = partial[2];
  var e0      = partial[3];
  var e1      = partial[4];
  var eavg    = partial[5];
  var det     = partial[6];
  var mh      = partial[7];

  if(baselen < tri_height_div0_eps) {
    var E = tri_height_div0_eps;
    var invE = 1/E;
    var maxlen2 = Math.max(baselen*baselen,
                           Math.max(Vec2.len2(e0), Vec2.len2(e1)));
    var scale = 1 / ( (maxlen2 < 1e-8)? 1e-8 : maxlen2 );

    jacobian.write(row_i, idx[0], scale * -e1[1]*invE   );
    jacobian.write(row_i, idx[1], scale *  e1[0]*invE   );
    jacobian.write(row_i, idx[2], scale *  e0[1]*invE   );
    jacobian.write(row_i, idx[3], scale * -e0[0]*invE   );
    jacobian.write(row_i, idx[4], scale * -base[1]*invE );
    jacobian.write(row_i, idx[5], scale *  base[0]*invE );
    jacobian.write(row_i, idx[6], scale * -1            );

  } else {
    var invbaselen = 1/baselen;

    var b0displace = [ (-e1[1] + nbase[0]*mh) * invbaselen, 
                       ( e1[0] + nbase[1]*mh) * invbaselen ];
    var b1displace = [ ( e0[1] - nbase[0]*mh) * invbaselen, 
                       (-e0[0] - nbase[1]*mh) * invbaselen ];
    var maxlen2 = Math.max(Vec2.len2(b0displace), Vec2.len2(b1displace))
        maxlen2 = Math.max(1, maxlen2); // no need to modify if < 1
    var scale = 1 / maxlen2;
    // This rescaling prevents large oscilation due to the base twisting

    jacobian.write(row_i, idx[0], scale * b0displace[0] );
    jacobian.write(row_i, idx[1], scale * b0displace[1] );
    jacobian.write(row_i, idx[2], scale * b1displace[0] );
    jacobian.write(row_i, idx[3], scale * b1displace[1] );
    jacobian.write(row_i, idx[4], scale * -nbase[1]     );
    jacobian.write(row_i, idx[5], scale *  nbase[0]     );
    jacobian.write(row_i, idx[6], scale * -1            );
  }
}
TriHeight.computeHeight = function(b0, b1, a) {
  var base    = Vec2.sub(b1,b0);
  var baselen = Vec2.len(base);
  var bavg    = Vec2.mul(0.5, Vec2.add(b1,b0));
  var eavg    = Vec2.sub(a, bavg);
  var det     = Vec2.cross(base,eavg);

  if(baselen < tri_height_div0_eps)   return det/tri_height_div0_eps;
  else                                return det/baselen;
}



// -------------------------------------------------------------------------


EqualPt.New = function(p0, p1) {
  var c = Object.create(EqualPt);
  c._p0 = p0;
  c._p1 = p1;
  return c;
}
EqualPt.numEquations = function() { return 2; }
EqualPt.variables = function() {
  return [
    this._p0.x(), this._p0.y(),
    this._p1.x(), this._p1.y(),
  ];
}
EqualPt.saveIndices = function() {
  this._x_indices = [ 
    this._p0.x()._solver_idx,
    this._p1.x()._solver_idx,
  ];
  this._y_indices = [ 
    this._p0.y()._solver_idx,
    this._p1.y()._solver_idx,
  ];
  this._indices = [
    this._x_indices[0], this._x_indices[1],
    this._y_indices[0], this._y_indices[1],
  ]
}
EqualPt.violationDistance = function(pos) {
  var posvec  = pos.data;

  var xi = this._x_indices;
  var yi = this._y_indices;
  var x0 = posvec[xi[0]];
  var x1 = posvec[xi[1]];
  var y0 = posvec[yi[0]];
  var y1 = posvec[yi[1]];
  var dx = x1-x0;
  var dy = y1-y0;

  return Math.max(Math.abs(dx),Math.abs(dy));
}
EqualPt.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;

  var xi = this._x_indices;
  var yi = this._y_indices;
  var x0 = posvec[xi[0]];
  var x1 = posvec[xi[1]];
  var y0 = posvec[yi[0]];
  var y1 = posvec[yi[1]];

  // squared form of the constraint equation here for scaling
  var dx = x1-x0;
  var dy = y1-y0;

  gradvec[xi[0]] += step_size * dx;
  gradvec[xi[1]] -= step_size * dx;
  gradvec[yi[0]] += step_size * dy;
  gradvec[yi[1]] -= step_size * dy;
}
EqualPt.writeJacobian = function(jacobian, row_i, pos) {
  var xrow = row_i;
  var yrow = row_i+1;
  var posvec = pos.data;

  var xi = this._x_indices;
  var yi = this._y_indices;

  jacobian.write(xrow, xi[0], -1);
  jacobian.write(xrow, xi[1],  1);
  jacobian.write(yrow, yi[0], -1);
  jacobian.write(yrow, yi[1],  1);
}
EqualPt.test = function(p0, p1, eps) {
  var eps2 = eps*eps;
  var xy0 = (p0.getxy)? p0.getxy() : p0;
  var xy1 = (p1.getxy)? p1.getxy() : p1;
  var dvec = Vec2.sub(xy1,xy0);
  var dist2 = Vec2.dot(dvec,dvec);
  return dist2 < eps2;
}


// -------------------------------------------------------------------------


EqualNum.New = function(a, b) {
  var c = Object.create(EqualNum);
  c._a = a;
  c._b = b;
  return c;
}
EqualNum.numEquations = function() { return 1; }
EqualNum.variables = function() {
  return [ this._a, this._b ];
}
EqualNum.saveIndices = function() {
  this._indices = [ this._a._solver_idx, this._b._solver_idx ];
}
EqualNum.violationDistance = function(pos) {
  var posvec  = pos.data;
  var ai = this._indices[0];
  var bi = this._indices[1];

  var a = posvec[ai];
  var b = posvec[bi];
  var d = a-b;

  return Math.abs(d);
}
EqualNum.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;
  var ai = this._indices[0];
  var bi = this._indices[1];

  var a = posvec[ai];
  var b = posvec[bi];
  var d = a-b;

  gradvec[ai] -= step_size * d;
  gradvec[bi] += step_size * d;
}
EqualNum.writeJacobian = function(jacobian, row_i, pos) {
  var ai = this._indices[0];
  var bi = this._indices[1];

  jacobian.write(row_i, ai,  1);
  jacobian.write(row_i, bi, -1);
}


// -------------------------------------------------------------------------


OnCircle.New = function(point, circle) {
  var onc = Object.create(OnCircle);
  onc._pt = point;
  onc._circ = circle;
  return onc;
}
OnCircle.numEquations = function() { return 1; }
OnCircle.variables = function() {
  return [
    this._pt.x(), this._pt.y(),
    this._circ.center().x(), this._circ.center().y(), this._circ.radius(),
  ];
}
OnCircle.saveIndices = function() {
  this._pxi = this._pt.x()._solver_idx;
  this._pyi = this._pt.y()._solver_idx;
  this._cxi = this._circ.center().x()._solver_idx;
  this._cyi = this._circ.center().y()._solver_idx;
  this._ri  = this._circ.radius()._solver_idx;
  this._indices = [this._pxi, this._pyi, this._cxi, this._cyi, this._ri];
}
// C = ||d|| - r
//    where d = p-c
//          n = d/||d||
// D[C] = n*D[d] - D[r]
// dC/dx  = nx
// dC/dy  = ny
// dC/dcx = -nx
// dC/dcy = -ny
// dC/dr  = -1
OnCircle.violationDistance = function(pos) {
  var posvec  = pos.data;

  var x     = posvec[this._pxi];
  var y     = posvec[this._pyi];
  var cx    = posvec[this._cxi];
  var cy    = posvec[this._cyi];
  var r     = posvec[this._ri];
  var dx    = x - cx;
  var dy    = y - cy;
  var dlen  = Math.sqrt(dx*dx+dy*dy);
  if(dlen < 1e-5) dlen = 1e-5;
  //var nx    = dx/dlen;
  //var ny    = dy/dlen;
  var diff  = dlen - r;

  return Math.abs(diff);
}
OnCircle.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;

  var x     = posvec[this._pxi];
  var y     = posvec[this._pyi];
  var cx    = posvec[this._cxi];
  var cy    = posvec[this._cyi];
  var r     = posvec[this._ri];
  var dx    = x - cx;
  var dy    = y - cy;
  var dlen  = Math.sqrt(dx*dx+dy*dy);
  if(dlen < 1e-5) dlen = 1e-5;
  var nx    = dx/dlen;
  var ny    = dy/dlen;
  var diff  = dlen - r;

  var scale = diff;

  gradvec[this._pxi] -= step_size * scale *  nx;
  gradvec[this._pyi] -= step_size * scale *  ny;
  gradvec[this._cxi] -= step_size * scale * -nx;
  gradvec[this._cyi] -= step_size * scale * -ny;
  gradvec[this._ri]  -= step_size * scale *  -1;
}
OnCircle.writeJacobian = function(jacobian, row_i, pos) {
  var posvec  = pos.data;

  var x     = posvec[this._pxi];
  var y     = posvec[this._pyi];
  var cx    = posvec[this._cxi];
  var cy    = posvec[this._cyi];
  var r     = posvec[this._ri];
  var dx    = x - cx;
  var dy    = y - cy;
  var dlen  = Math.sqrt(dx*dx+dy*dy);
  if(dlen < 1e-5) dlen = 1e-5;
  var nx    = dx/dlen;
  var ny    = dy/dlen;
  var diff  = dlen - r;

  var scale = 1;

  jacobian.write(row_i, this._pxi, scale *  nx);
  jacobian.write(row_i, this._pyi, scale *  ny);
  jacobian.write(row_i, this._cxi, scale * -nx);
  jacobian.write(row_i, this._cyi, scale * -ny);
  jacobian.write(row_i, this._ri,  scale *  -1);
}
OnCircle.distanceToCircle = function(point, circle) {
  var p = point.getxy();
  var r = circle.radius().get();
  var c = circle.center().getxy();

  var d = Vec2.sub(p, c);
  var dlen = Vec2.len(d);
  return Math.abs(dlen - r);
}


// -------------------------------------------------------------------------


AvgRadius.New = function(points, center, avgrad) {
  var c = Object.create(AvgRadius);
  c._N_pts  = points.length;
  c._pts    = points;
  c._center = center;
  c._avgrad = avgrad;
  return c;
}
AvgRadius.numEquations = function() { return 3; }
AvgRadius.variables = function() {
  var scalars = [
    this._center.x(), this._center.y(), this._avgrad,
  ];
  for(var k=0; k<this._N_pts; k++) {
    scalars.push(this._pts[k].x());
    scalars.push(this._pts[k].y());
  }
  return scalars;
}
AvgRadius.saveIndices = function() {
  this._cxi   = this._center.x()._solver_idx;
  this._cyi   = this._center.y()._solver_idx;
  this._ri    = this._avgrad._solver_idx;
  this._pxis  = [];
  this._pyis  = [];
  this._indices = [this._cxi, this._cyi, this._ri];
  for(var k=0; k<this._N_pts; k++) {
    this._pxis[k] = this._pts[k].x()._solver_idx;
    this._pyis[k] = this._pts[k].y()._solver_idx;
    this._indices.push(this._pxis[k]);
    this._indices.push(this._pyis[k]);
  }
}
// F = 1/n * SUM_i[ SQRT(dot(P_i-C, P_i-C)) ] - R
// Let D_i = P_i-C, and N_i = D_i / SQRT(D_i^2) (i.e. normalized)
// then
// dF/dP_i = 1/n * N_i
// dF/dC   = - 1/n * SUM_i[N_i]
// dF/dR   = -1
// G = 1/n * SUM_i[P_i] - C
// dG/dP_i = 1/n
// dG/dC   = -1
function avgrad_normals_eval(cx,cy, pxs,pys, N) {
  var avgr = 0;
  var avgnx = 0;
  var avgny = 0;
  var avgx = 0;
  var avgy = 0;
  var nxs = [];
  var nys = [];

  var invN = 1/N;
  for(var k=0; k<N; k++) {
    avgx  += pxs[k];
    avgy  += pys[k];
    var x = pxs[k] - cx;
    var y = pys[k] - cy;
    var len = Math.sqrt(x*x + y*y);
    var invlen = 1/len;
    var nx = invlen*invN * x;
    var ny = invlen*invN * y;

    avgnx += nx;
    avgny += ny;
    avgr  += len;
    nxs[k] = nx;
    nys[k] = ny;
  }
  avgr *= invN;
  avgx *= invN;
  avgy *= invN;

  return [avgr, avgnx, avgny, avgx, avgy, nxs, nys];
}
AvgRadius.violationDistance = function(pos) {
  var posvec  = pos.data;

  var cx  = posvec[this._cxi];
  var cy  = posvec[this._cyi];
  var r   = posvec[this._ri];
  var pxs = [];
  var pys = [];
  for(var k=0; k<this._N_pts; k++) {
    pxs[k] = posvec[this._pxis[k]];
    pys[k] = posvec[this._pyis[k]];
  }
  var invN = 1/this._N_pts;

  var normals = avgrad_normals_eval(cx,cy,pxs,pys,this._N_pts);
  var avgr  = normals[0];
  var avgx  = normals[3];
  var avgy  = normals[4];
  var dr = avgr - r;
  var dx = avgx - cx;
  var dy = avgy - cy;

  // the largest change required to satisfy the constraint
  return Math.max(Math.abs(dr), Math.max(Math.abs(dx), Math.abs(dy)));
}
AvgRadius.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;

  var cx  = posvec[this._cxi];
  var cy  = posvec[this._cyi];
  var r   = posvec[this._ri];
  var pxs = [];
  var pys = [];
  for(var k=0; k<this._N_pts; k++) {
    pxs[k] = posvec[this._pxis[k]];
    pys[k] = posvec[this._pyis[k]];
  }
  var invN = 1/this._N_pts;

  var normals = avgrad_normals_eval(cx,cy,pxs,pys,this._N_pts);
  var avgr  = normals[0];
  var avgnx = normals[1];
  var avgny = normals[2];
  var avgx  = normals[3];
  var avgy  = normals[4];
  var nxs   = normals[5];
  var nys   = normals[6];
  var evalR = avgr - r;
  var evalX = avgx - cx;
  var evalY = avgy - cy;

  var scaleR = evalR;
  var scaleX = evalX;
  var scaleY = evalY;

  gradvec[this._cxi] -= step_size * ( scaleR * -avgnx +
                                      scaleX * -1 );
  gradvec[this._cyi] -= step_size * ( scaleR * -avgny +
                                      scaleY * -1 );
  gradvec[this._ri]  -= step_size * scaleR * -1;
  for(var k=0; k<this._N_pts; k++) {
    gradvec[this._pxis[k]] -= step_size * ( scaleR * nxs[k] +
                                            scaleX * invN );
    gradvec[this._pyis[k]] -= step_size * ( scaleR * nys[k] +
                                            scaleX * invN );
  }
}
AvgRadius.writeJacobian = function(jacobian, row_i, pos) {
  var row_r   = row_i;
  var row_cx  = row_i+1;
  var row_cy  = row_i+2;
  var posvec  = pos.data;

  var cx  = posvec[this._cxi];
  var cy  = posvec[this._cyi];
  var r   = posvec[this._ri];
  var pxs = [];
  var pys = [];
  for(var k=0; k<this._N_pts; k++) {
    pxs[k] = posvec[this._pxis[k]];
    pys[k] = posvec[this._pyis[k]];
  }
  var invN = 1/this._N_pts;

  var normals = avgrad_normals_eval(cx,cy,pxs,pys,this._N_pts);
  var avgr  = normals[0];
  var avgnx = normals[1];
  var avgny = normals[2];
  var avgx  = normals[3];
  var avgy  = normals[4];
  var nxs   = normals[5];
  var nys   = normals[6];
  //var evalR = avgr - r;
  //var evalX = avgx - cx;
  //var evalY = avgy - cy;

  var scale = 1;

  jacobian.write(row_r,  this._cxi, scale * -avgnx);
  jacobian.write(row_r,  this._cyi, scale * -avgny);
  jacobian.write(row_cx, this._cxi, scale * -1);
  jacobian.write(row_cy, this._cyi, scale * -1);
  jacobian.write(row_r,  this._ri,  scale * -1);
  for(var k=0; k<this._N_pts; k++) {
    jacobian.write(row_r,  this._pxis[k], scale * nxs[k]);
    jacobian.write(row_r,  this._pyis[k], scale * nys[k]);
    jacobian.write(row_cx, this._pxis[k], scale * invN);
    jacobian.write(row_cy, this._pyis[k], scale * invN);
  }
}


// -------------------------------------------------------------------------


Average.New = function(vals, avg) {
  var c = Object.create(Average);
  c._N      = vals.length;
  c._vals   = vals;
  c._avg    = avg;
  return c;
}
Average.numEquations = function() { return 1; }
Average.variables = function() {
  var scalars = this._vals.slice();
  scalars.push(this._avg);
  return scalars;
}
Average.saveIndices = function() {
  this._indices = [];
  for(var k=0; k<this._N; k++) {
    this._indices[k] = this._vals[k]._solver_idx;
  }
  this._indices[this._N] = this._avg._solver_idx;
}
// C = 1/n * SUM_i[ V_i ] - AVG
// dC/dV_i = 1/n
// dC/dAVG = -1
function average_eval(N, idx, posvec) {
  var avg   = posvec[idx[N]];
  var vals  = [];

  var comp_avg = 0;
  for(var k=0; k<N; k++) {
    vals[k] = posvec[idx[k]];
    comp_avg += vals[k];
  }
  comp_avg /= N;

  return [vals, avg, comp_avg - avg];
}
Average.violationDistance = function(pos) {
  var posvec  = pos.data;
  var idx     = this._indices;
  var N       = this._N;

  var eval_results = average_eval(N, idx, posvec);
  var vals = eval_results[0];
  var avg  = eval_results[1];
  var diff = eval_results[2];

  return Math.abs(diff);
}
Average.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;
  var idx     = this._indices;
  var N       = this._N;
  var invN    = 1/N;

  var eval_results = average_eval(N, idx, posvec);
  var vals = eval_results[0];
  var avg  = eval_results[1];
  var diff = eval_results[2];

  var scale = diff;

  for(var k=0; k<N; k++) {
    gradvec[idx[k]] -= step_size * scale * invN;
  }
  gradvec[idx[N]] -= step_size * scale * -1;
}
Average.writeJacobian = function(jacobian, row_i, pos) {
  var posvec  = pos.data;
  var idx     = this._indices;
  var N       = this._N;
  var invN    = 1/N;

  var eval_results = average_eval(N, idx, posvec);
  var vals = eval_results[0];
  var avg  = eval_results[1];
  var diff = eval_results[2];

  var scale = 1;

  for(var k=0; k<N; k++) {
    jacobian.write(row_i, idx[k], scale * invN);
  }
  jacobian.write(row_i, idx[N], scale * -1);
}


// -------------------------------------------------------------------------






/*
Cocircular.New = function(p0, p1, p2, p3) {
  var c = Object.create(Colinear);
  c._p = [p0,p1,p2,p3];
  return c;
}
Cocircular.numEquations = function() { return 1; }
Cocircular.variables = function() {
  var p = this._p;
  var vs = [];
  for(var k=0; k<4; k++) {
    vs[2*k    ] = p[k].x();
    vs[2*k + 1] = p[k].y();
  }
  return vs;
}
Cocircular.saveIndices = function() {
  this._x_indices = [];
  this._y_indices = [];
  for(var k=0; k<4; k++) {
    this._x_indices[k] = this._p[k].x()._solver_idx;
    this._y_indices[k] = this._p[k].y()._solver_idx;
  }
}
// The Big Idea: you can measure cocircularity with a 4x4 determinant
// Let sk = xk^2 + yk^2
//   and L(pk) = [xk, yk, sk, 1]
// C = DET[ L(p0) ; L(p1) ; L(p2) ; L(p3) ] = 0 is the numeric constraint
// derivatives...
// first, general derivative
// do the derivatives with respect to p0 to start with
// since everything should be symmetric, that should explain it...
// LET D123 = x2*y3 - y2*x3 + x3*y1 - y3*x1 + x1*y2 - y1*x2
//    (that is, the 3x3 determinant of point coordinates with
//      1s in the last row, this is the colinearity determinant)
// If we let S stand in for X or Y, then we get SY123 or XS123
//
// dC/dx0 = -SY123 + 2*x0 * D123
// dC/dy0 = -XS123 + 2*y0 * D123
//    (note that these are degree 3 polynomial expressions)
function cocirc_det(x,y, i,j,k) { // helper for Det with all 1s in last row
  return  x[j]*y[k] - x[k]*y[j] +
          x[k]*y[i] - x[i]*y[k] +
          x[i]*y[j] - x[j]*y[i] ;
}
function deriv_x(d, i,j,k, x,y,s) {
  return 2*x[d] * cocirc_det(x,y, i,j,k) - cocirc_det(s,y, i,j,k);
}
function deriv_y(d, i,j,k, x,y,s) {
  return 2*y[d] * cocirc_det(x,y, i,j,k) - cocirc_det(x,s, i,j,k);
}
function det3x3(x,y,z) {
  return  x[0] * (y[1] * z[2] - y[2] * z[1])
        + x[1] * (y[2] * z[0] - y[0] * z[2])
        + x[2] * (y[2] * z[0] - y[0] * z[2])
}
function cocircular_eval(x,y,s) {
  var d0 = [ x[0]-x[3], y[0]-y[3], s[0]-s[3] ];
  var d1 = [ x[1]-x[3], y[1]-y[3], s[1]-s[3] ];
  var d2 = [ x[2]-x[3], y[2]-y[3], s[2]-s[3] ];
  return det3x3(d0,d1,d2);
}
Cocircular.accumulateEnforcementGradient = function(step_size, grad, pos) {
  var posvec  = pos.data;
  var gradvec = grad.data;

  var xi = this._x_indices;
  var yi = this._y_indices;
  var x = [ posvec[xi[0]], posvec[xi[1]], posvec[xi[2]], posvec[xi[3]] ];
  var y = [ posvec[yi[0]], posvec[yi[1]], posvec[yi[2]], posvec[yi[3]] ];
  var s = [];
  for(var k=0; k<4; k++) s[k] = x[k]*x[k] + y[k]*y[k];

  var det = cocircular_eval(x,y,s);

  // ok, let's go ahead and figure out what the scale factor should be
  // roughly, the determinant we're computing is degree 3 with one degree 2
  // input, which makes the whole thing approximately degree 4.

  // e[i] is opposite vertex i
  var ex = [ x[2] - x[1], x[0] - x[2], x[1] - x[0] ];
  var ey = [ y[2] - y[1], y[0] - y[2], y[1] - y[0] ];

  var scale_len = 0;
  for(var k=0; k<3; k++)
    scale_len = Math.max(scale_len, ex[k]*ex[k] + ey[k]*ey[k]);

  for(var k=0; k<3; k++) {
    var rotx  = -ey[k];
    var roty  =  ex[k];
    var scale = (scale_len < 0.0000001)? 0 : det / scale_len;

    gradvec[xi[k]] -= step_size * scale * rotx;
    gradvec[yi[k]] -= step_size * scale * roty;
  }
}
Cocircular.writeJacobian = function(jacobian, row_i, pos) {
  var posvec = pos.data;

  var xi = this._x_indices;
  var yi = this._y_indices;
  var x = [ posvec[xi[0]], posvec[xi[1]], posvec[xi[2]] ];
  var y = [ posvec[yi[0]], posvec[yi[1]], posvec[yi[2]] ];
  var ex = [ x[2] - x[1], x[0] - x[2], x[1] - x[0] ];
  var ey = [ y[2] - y[1], y[0] - y[2], y[1] - y[0] ];

  var scale_factor = 0;
  for(var k=0; k<3; k++)
    scale_factor = Math.max(scale_factor, ex[k]*ex[k] + ey[k]*ey[k]);
  scale_factor = Math.sqrt(scale_factor);
  scale_factor = Math.max(0.000001, scale_factor);
  scale_factor = 1.0/scale_factor;

  jacobian.write(row_i, xi[0], scale_factor * -ey[0] );
  jacobian.write(row_i, yi[0], scale_factor *  ex[0] );
  jacobian.write(row_i, xi[1], scale_factor * -ey[1] );
  jacobian.write(row_i, yi[1], scale_factor *  ex[1] );
  jacobian.write(row_i, xi[2], scale_factor * -ey[2] );
  jacobian.write(row_i, yi[2], scale_factor *  ex[2] );
}


*/













// TODO
// VERTICAL
// HORIZONTAL
// ANGLES (e.g. right angles)



// a template to help in writing new constraints
var Template = {};
Template.New = function(params) {
  return Object.create(Template);
}
Template.numEquations = function() {
  return 1; // number of equations which must be satisfied
}
Template.variables = function() {
  return []; // array of scalars being referred to
}
Template.saveIndices = function() {
  // an opportunity to record the packed vector indices for variables
}
Template.violationDistance = function(pos) {
  // a measurement of how far individual points would
  // have to move in order to satisfy this constraint.
  // This is essentially a rescaling of the constraint function itself.
}
Template.accumulateEnforcementGradient = function(step_size, grad, pos) {
  // accumulate into 'grad' the negative gradient of the constraint function
  // at position 'pos'.  Scale the written value by 'step_size'.
}
Template.writeJacobian = function(jacobian, row_i, pos) {
  // write into the 'jacobian' matrix the linearized form of the
  // constraint at position 'pos'.  Start writing at row 'row_i'.
}












})(typeof window === 'undefined');
