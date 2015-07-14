'use strict';
/*  
 *  linalg.js
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
var exports = on_node? module.exports : window['linalg']={};

// modules
if(on_node) {
} else {
}



// for debug
function dump_vec(v) {
  var arr=[];
  for(var k=0; k<v.length; k++) arr[k] = v.data[k];
  return arr;
}



var DenseVector  = (exports.DenseVector = {});
var SparseMatrix = (exports.SparseMatrix = {});


DenseVector.New = function(length) {
  if(typeof(length) == 'object' && length.length) {
    var array = length;
    length = array.length;
  }

  var vec = Object.create(DenseVector);
  vec.data = new Float64Array(length);
  vec.length = length;

  if(array) {
    for(var k=0; k<length; k++)
      vec.data[k] = array[k];
  }

  return vec;
}
DenseVector.swap = function(rhs) {
  if(Object.getPrototypeOf(rhs) !== DenseVector)
    throw new TypeError("expected DenseVector argument");
  if(this.length !== rhs.length)
    throw new TypeError("Can only swap vectors of equal length");

  var temp = this.data;
  this.data = rhs.data;
  rhs.data = temp;
}
DenseVector.copyFrom = function(rhs) {
  if(Object.getPrototypeOf(rhs) !== DenseVector)
    throw new TypeError("expected DenseVector argument");
  if(this.length !== rhs.length)
    throw new TypeError("Can only copy vectors of equal length");

  this.data.set(rhs.data);
}
DenseVector.zero = function() {
  for(var k=0; k<this.length; k++)
    this.data[k] = 0;
}
DenseVector.negate = function() {
  for(var k=0; k<this.length; k++)
    this.data[k] = -this.data[k];
}
DenseVector.acc_vec = function(rhs) {
  if(Object.getPrototypeOf(rhs) !== DenseVector)
    throw new TypeError("expected DenseVector argument");
  if(this.length !== rhs.length)
    throw new TypeError("Can only copy vectors of equal length");

  for(var k=0; k<this.length; k++)
    this.data[k] += rhs.data[k];
}

SparseMatrix.New = function(nRows, nCols) {
  var mat = Object.create(SparseMatrix);
  mat.nrows = nRows;
  mat.ncols = nCols;

  mat.triples = [];
  mat.compressed = false;
  return mat;
}
SparseMatrix.write = function(i,j,val) {
  this.triples.push([i,j,val]);
}
SparseMatrix.rowcompress = function() {
  var mat = this;
  mat.ndata     = mat.triples.length;
  mat.rowstart  = new Int32Array(mat.nrows + 1);
  mat.colidx    = new Int32Array(mat.ndata);
  mat.data      = new Float64Array(mat.ndata);

  // sort the triples
  mat.triples.sort(function(a,b) {
    var dr = a[0] - b[0];
    return (dr)? dr : a[1] - b[1];
  })

  // dump out to arrays
  var r = 0;
  mat.rowstart[r] = 0;
  for(var k=0; k<mat.ndata; k++) {
    var triple = mat.triples[k];

    var ri = triple[0];
    var ci = triple[1];
    var val = triple[2];

    while(r < ri) { // advance the row index
      r++;
      mat.rowstart[r] = k;
    }
    mat.colidx[k] = ci;
    mat.data[k]   = val;
  }
  // finish out the indexing array
  while(r < mat.nrows) {
    r++;
    mat.rowstart[r] = mat.ndata;
  }

  // clear the triples
  mat.triples = [];
  mat.compressed = true;
}
SparseMatrix.uncompress = function() {
  var mat = this;
  if(!mat.compressed) return;
  mat.compressed = true;

  mat.triples = [];
  var r = 0;
  for(var k=0; k<mat.ndata; k++) {
    while(A.rowstart[r+1] <= k) r++;

    var c = mat.colidx[k];
    var val = mat.data[k];

    mat.triples.push([r,c,val]);
  }
}
SparseMatrix.transpose = function() {
  var compressed = this.compressed;
  if(compressed) this.uncompress();

  var triples = this.triples;
  for(var k=0; k<triples.length; k++) {
    var tp = triples[k];
    var r = tp[0];
    var c = tp[1];
    tp[0] = c;
    tp[1] = r;
  }
  var nrows = this.nrows;
  this.nrows = this.ncols;
  this.ncols = nrows;

  if(compressed) this.rowcompress();
}



// unguarded functions

// Y += A * X for A matrix and X vector
function accumulate_matrix_vector_multiply(Y,A,X) {
  var yvec = Y.data;
  var xvec = X.data;
  var r = 0;
  for(var k=0; k < A.ndata; k++) {
    while(A.rowstart[r+1] <= k) r++; // update row

    var c = A.colidx[k];
    var m_rc = A.data[k];

    yvec[r] += m_rc * xvec[c];
  }
}

// Y += transpose(A) * X for A matrix and X vector
function accumulate_transpose_matrix_vector_multiply(Y,A,X) {
  var yvec = Y.data;
  var xvec = X.data;
  var r = 0;
  for(var k=0; k < A.ndata; k++) {
    while(A.rowstart[r+1] <= k) r++; // update row

    var c = A.colidx[k];
    var m_rc = A.data[k];

    yvec[c] += m_rc * xvec[r]; // swap x & y roles...
  }
}

// Y = A * X for A matrix and X vector
function matrix_vector_multiply(Y,A,X) {
  // dumb implementation for now
  Y.zero();
  accumulate_matrix_vector_multiply(Y,A,X);
}

// Y = transpose(A) * X for A matrix and X vector
function transpose_matrix_vector_multiply(Y,A,X) {
  Y.zero();
  accumulate_transpose_matrix_vector_multiply(Y,A,X);
}

// compute <X,Y>
function dot_vec(X,Y) {
  var xvec = X.data;
  var yvec = Y.data;
  var N = X.length;
  var sum = 0;
  for(var k=0; k<N; k++)
    sum += xvec[k]*yvec[k];
  return sum;
}
// X = X + a * Y
function acc_vec_plus_scaled_vec(X,a,Y) {
  var N = X.length;
  var xvec = X.data;
  var yvec = Y.data;
  for(var k=0; k<N; k++)
    xvec[k] += a*yvec[k];
}
function L2_dist(X,Y) {
  var xvec = X.data;
  var yvec = Y.data;
  var N = X.length;
  var sum = 0;
  for(var k=0; k<N; k++) {
    var d = xvec[k] - yvec[k];
    sum += d*d;
  }
  return sum;
}

// Y = InvDiag * X
function apply_diag_precondition(Y,InvDiag,X) {
  var N = X.length;
  var xvec = X.data;
  var yvec = Y.data;
  var dvec = InvDiag.data;
  for(var k=0; k<N; k++)
    yvec[k] = xvec[k] * dvec[k];
}

// solve for X: (A^t * A) * X = B
function conjgrad_solve_AtAx(
  X,A,B,
  max_iters, residual_cutoff, regularization
) {
  var N = X.length;
  var M = A.nrows;

  // compute the diagonal of (A^t * A)
  var InvDiag = DenseVector.New(N); InvDiag.zero();
  var dvec = InvDiag.data;
  // do in matrix-matrix-product via outer-product order
  for(var r = 0; r < M; r++) {
    var start = A.rowstart[r];
    var end = A.rowstart[r+1];
    for(var k=start; k<end; k++) {
      var c = A.colidx[k];
      var val = A.data[k];

      dvec[c] += val*val;
    }
  }
  // Invert:
  for(var k=0; k<N; k++) {
    dvec[k] += regularization;
    // guarding small values will just degrade the preconditioner worst case
    if(dvec[k] < 0.00001) dvec[k] = 0.00001;
    dvec[k] = 1.0/dvec[k];
    //dvec[k] = 1.0;
  }
  // -----------

  // temporaries
  var AP = DenseVector.New(M);
  var AtAP = DenseVector.New(N);

  // initialize and declare all variables
  X.zero(); // start search at zero
  var R = DenseVector.New(N);
  R.copyFrom(B);
  var Z = DenseVector.New(N);
  apply_diag_precondition(Z,InvDiag,R);
  var residual = dot_vec(R,Z);
  var P = DenseVector.New(N);
  P.copyFrom(Z);
  var iteration = 0;

  do {
    var old_residual = residual;

    // compute step size
    matrix_vector_multiply(AP, A, P);
    var alpha_denom = dot_vec(AP,AP) + regularization * dot_vec(P,P);
    if(alpha_denom < 0.0001) alpha_denom = 0.0001; // safety
    var alpha = old_residual / alpha_denom;

    // solution update
    acc_vec_plus_scaled_vec(X, alpha, P);
    // residual vector update
    transpose_matrix_vector_multiply(AtAP, A, AP);
    acc_vec_plus_scaled_vec(AtAP, regularization, P); // regularize
    acc_vec_plus_scaled_vec(R, -alpha, AtAP);
    apply_diag_precondition(Z,InvDiag,R);
    residual = dot_vec(R,Z);

    // adjust the P vector
    var beta = residual / old_residual;
    var pvec = P.data;
    var zvec = Z.data;
    for(var k=0; k<N; k++)
      pvec[k] = zvec[k] + beta*pvec[k];

    // check exit
    iteration++;
    //console.log(residual);
  } while(iteration < max_iters && residual > residual_cutoff);
  //console.log('X',dump_vec(X));
  //console.log('Conjugate Gradient Solve -- '+
  //  'n_iter: '+iteration+' residual: '+residual);
  return { iterations: iteration, residual: residual };
}
// solve for X: (A * A^t) * X = B
function conjgrad_solve_AAtx(
  X,A,B,
  max_iters, residual_cutoff, regularization
) {
  var N = X.length;
  var M = A.ncols;

  // compute the diagonal of (A * A^t)
  var InvDiag = DenseVector.New(N); InvDiag.zero();
  var dvec = InvDiag.data;
  // do matrix-matrix-product via dot-product order
  for(var r = 0; r < N; r++) {
    var start = A.rowstart[r];
    var end   = A.rowstart[r+1];
    dvec[r]   = 0;
    for(var k=start; k<end; k++) {
      var val = A.data[k];
      dvec[r] += val*val;
    }
  }
  // Invert:
  for(var k=0; k<N; k++) {
    dvec[k] += regularization;
    // guarding small values will just degrade the preconditioner worst case
    if(dvec[k] < 0.00001) dvec[k] = 0.00001;
    dvec[k] = 1.0/dvec[k];
    //dvec[k] = 1.0;
  }
  // -----------

  // temporaries
  var AtP = DenseVector.New(M);
  var AAtP = DenseVector.New(N);

  // initialize and declare all variables
  X.zero(); // start search at zero
  var R = DenseVector.New(N);
  R.copyFrom(B);
  var Z = DenseVector.New(N);
  apply_diag_precondition(Z,InvDiag,R);
  var residual = dot_vec(R,Z);
  var P = DenseVector.New(N);
  P.copyFrom(Z);
  var iteration = 0;

  do {
    var old_residual = residual;

    // compute step size
    transpose_matrix_vector_multiply(AtP, A, P);
    var alpha_denom = dot_vec(AtP,AtP) + regularization * dot_vec(P,P);
    if(alpha_denom < 0.0001) alpha_denom = 0.0001; // safety
    var alpha = old_residual / alpha_denom;

    // solution update
    acc_vec_plus_scaled_vec(X, alpha, P);
    // residual vector update
    matrix_vector_multiply(AAtP, A, AtP);
    acc_vec_plus_scaled_vec(AAtP, regularization, P); // regularize
    acc_vec_plus_scaled_vec(R, -alpha, AAtP);
    apply_diag_precondition(Z,InvDiag,R);
    residual = dot_vec(R,Z);

    // adjust the P vector
    var beta = residual / old_residual;
    var pvec = P.data;
    var zvec = Z.data;
    for(var k=0; k<N; k++)
      pvec[k] = zvec[k] + beta*pvec[k];

    // check exit
    iteration++;
    //console.log(residual);
  } while(iteration < max_iters && residual > residual_cutoff);
  //console.log('X',dump_vec(X));
  //console.log('Conjugate Gradient Solve -- '+
  //  'n_iter: '+iteration+' residual: '+residual);
  return { iterations: iteration, residual: residual };
}





function mat_vec_check(Y,A,X) {
  if(Object.getPrototypeOf(A) !== SparseMatrix)
    throw new TypeError('first arg must be sparse matrix');
  if(Object.getPrototypeOf(X) !== DenseVector)
    throw new TypeError('second arg must be dense vector');

  var N = Y.length;
  var M = X.length;
  if(A.nrows !== N || A.ncols !== M)
    throw new TypeError('dimension mismatch');
}
DenseVector.acc_mat_vec = function(A,X) {
  var Y = this;
  mat_vec_check(Y,A,X);
  accumulate_matrix_vector_multiply(Y,A,X);
}
DenseVector.set_mat_vec = function(A,X) {
  var Y = this;
  mat_vec_check(Y,A,X);
  matrix_vector_multiply(Y,A,X);
}

function mat_T_vec_check(Y,A,X) {
  if(Object.getPrototypeOf(A) !== SparseMatrix)
    throw new TypeError('first arg must be sparse matrix');
  if(Object.getPrototypeOf(X) !== DenseVector)
    throw new TypeError('second arg must be dense vector');

  var N = Y.length;
  var M = X.length;
  if(A.nrows !== M || A.ncols !== N)
    throw new TypeError('dimension mismatch');
}
DenseVector.acc_mat_T_vec = function(A,X) {
  var Y = this;
  mat_T_vec_check(Y,A,X);
  accumulate_transpose_matrix_vector_multiply(Y,A,X);
}
DenseVector.set_mat_T_vec = function(A,X) {
  var Y = this;
  mat_T_vec_check(Y,A,X);
  transpose_matrix_vector_multiply(Y,A,X);
}





var conjgrad_solve_AtAx_help_msg =
  "linalg.conjgrad_solve_AtAx(X,A,B,iters,residual) expects:\n"+
  "  X              -   n-dimensional DenseVector\n"+
  "  A              - mxn-dimensional SparseMatrix\n"+
  "  B              -   n-dimensional DenseVector\n"+
  "  iters          - maximum number of iterations allowed\n"+
  "  residual       - residual size exit condition"+
  "  regularization - how much regularization to use";
exports.conjgrad_solve_AtAx = function(
  X,A,B,
  max_iters, residual_cutoff, regularization
) {
  if(Object.getPrototypeOf(X) !== DenseVector ||
     Object.getPrototypeOf(A) !== SparseMatrix ||
     Object.getPrototypeOf(B) !== DenseVector)
        throw new TypeError(conjgrad_solve_AtAx_help_msg);

  var N = X.length;
  //var M = A.nrows;
  if(A.ncols !== N || B.length != N)
    throw new TypeError(conjgrad_solve_AtAx_help_msg);

  return conjgrad_solve_AtAx(
    X,A,B,
    max_iters, residual_cutoff, regularization
  );
}

var conjgrad_solve_AAtx_help_msg =
  "linalg.conjgrad_solve_AAtx(X,A,B,iters,residual) expects:\n"+
  "  X              -   n-dimensional DenseVector\n"+
  "  A              - nxm-dimensional SparseMatrix\n"+
  "  B              -   n-dimensional DenseVector\n"+
  "  iters          - maximum number of iterations allowed\n"+
  "  residual       - residual size exit condition"+
  "  regularization - how much regularization to use";
exports.conjgrad_solve_AAtx = function(
  X,A,B,
  max_iters, residual_cutoff, regularization
) {
  if(Object.getPrototypeOf(X) !== DenseVector ||
     Object.getPrototypeOf(A) !== SparseMatrix ||
     Object.getPrototypeOf(B) !== DenseVector)
        throw new TypeError(conjgrad_solve_AAtx_help_msg);

  var N = X.length;
  //var M = A.ncols;
  if(A.nrows !== N || B.length != N)
    throw new TypeError(conjgrad_solve_AAtx_help_msg);

  return conjgrad_solve_AAtx(
    X,A,B,
    max_iters, residual_cutoff, regularization
  );
}


// AA^tX = B
var jacobi_solve_AAtx_help_msg =
  "linalg.jacobi_solve_AAtx(X,A,B,iters,residual) expects:\n"+
  "  X        -   n-dimensional DenseVector\n"+
  "  A        - nxm-dimensional SparseMatrix\n"+
  "  B        -   n-dimensional DenseVector\n"+
  "  iters    - maximum number of iterations allowed\n"+
  "  residual - residual size exit condition\n";
exports.jacobi_solve_AAtx = function(X,A,B, max_iters, residual_cutoff)
{
  if(Object.getPrototypeOf(X) !== DenseVector ||
     Object.getPrototypeOf(A) !== SparseMatrix ||
     Object.getPrototypeOf(B) !== DenseVector)
        throw new TypeError(jacobi_solve_AAtx_help_msg);

  var N = X.length;
  var M = A.ncols;
  if(A.nrows !== N)
    throw new TypeError(jacobi_solve_AAtx_help_msg);

  // compute diagonal vector
  var Diag = DenseVector.New(N);
  for(var r = 0; r < N; r++) {
    var sum = 0;
    var start = A.rowstart[r];
    var end = A.rowstart[r+1];
    for(var k=start; k<end; k++) {
      var a = A.data[k];
      sum += a*a;
    }
    // since this is just for preconditioning, make sure that
    // we don't divide by absurdly small values
    if(sum < 0.001) sum = 0.001;
    Diag.data[r] = sum;
  }
  var dvec = Diag.data;

  // intermediary for matrix multiplication
  var mult_middle = DenseVector.New(M);

  // init solution search
  X.copyFrom(B); // initialize to B; hey it's an ok guess

  // each iteration of jacobi is
  // Xnew = invD * (B - (AA^t-D)*Xold) [src: wikipedia]
  //      = invD * (B - AA^t*Xold) + Xold
  // D is the diagonal of AA^t

  var Xold = DenseVector.New(N);

  var residual = 0;
  var iterations = 0;
  do {
    // an iteration starts here
    residual = 0;
    Xold.swap(X);
    // --
    X.copyFrom(B);
    X.negate();
    // X = -B
    transpose_matrix_vector_multiply(mult_middle, A, Xold);
    accumulate_matrix_vector_multiply(X, A, mult_middle);
    // X = -B + AA^t*Xold
    var xvec = X.data;
    var xoldvec = Xold.data;
    for(var k=0; k<N; k++) {
      residual += xvec[k]*xvec[k];
      xvec[k] = (-xvec[k] / dvec[k]) + xoldvec[k];
    }
    // X = invD * (B - AA^t*Xold) + Xold
    iterations += 1;
  } while(residual > residual_cutoff && iterations < max_iters);
  console.log('Jacobi Solve -- n_iter: '+iterations+' residual: '+residual);
}








})(typeof window === 'undefined');
