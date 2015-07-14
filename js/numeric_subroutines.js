/*  
 *  numeric_subroutines.js
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
var exports = on_node? module.exports : window['numeric_subroutines']={};


// using the Modified Least Squares method from Umbach and Jones 2000
exports.fit_circle = function(points) {
  // to improve numeric stability, we're going to center the data points
  var N = points.length;
  var xs = [];
  var ys = [];
  var mean_x = 0;
  var mean_y = 0;
  for(var k=0; k<N; k++) {
    var coords = points[k];
    xs[k] = coords[0];
    ys[k] = coords[1];
    mean_x += xs[k];
    mean_y += ys[k];
  }
  mean_x /= N;
  mean_y /= N;

  var sum_x   = 0;
  var sum_y   = 0;
  var sum_xy  = 0;
  var sum_x2  = 0;
  var sum_y2  = 0;
  var sum_xy2 = 0;
  var sum_x3  = 0;
  var sum_yx2 = 0;
  var sum_y3  = 0;

  // compute sums
  var N = points.length;
  for(var k=0; k<N; k++) {
    var x = xs[k] - mean_x;
    var y = ys[k] - mean_y;
    var x2 = x*x;
    var y2 = y*y;
    var x3 = x2*x;
    var y3 = y2*y;
    var xy = x*y;
    var xy2 = x*y2;
    var yx2 = y*x2;

    sum_x += x;
    sum_y += y;
    sum_xy += xy;
    sum_x2 += x2;
    sum_y2 += y2;
    sum_x3 += x3;
    sum_y3 += y3;
    sum_xy2 += xy2;
    sum_yx2 += yx2;
  }

  // compute linear system parameters given in Umbach and Jones
  // I am not worrying about minimizing floating-point error here
  // but I suspect more attention could be paid given that these are
  // essentially covariance estimates
  var A = N*sum_x2 - sum_x*sum_x;
  var B = N*sum_xy - sum_x*sum_y;
  var C = N*sum_y2 - sum_y*sum_y;
  var D = 0.5 * (N*sum_xy2 - sum_x*sum_y2 + N*sum_x3 - sum_x*sum_x2);
  var E = 0.5 * (N*sum_yx2 - sum_y*sum_x2 + N*sum_y3 - sum_y*sum_y2);

  var cx = mean_x;
  var cy = mean_y;

  // The denominator is proportional to the determinant of the covariance
  // matrix, so it should never be negative.  However, if it's too small,
  // then the point distribution is very nearly colinear.
  // So, our cutoff for too small should relate a measurement of the
  // longest 1-dimensional measurement to this 2-dimensional measurement
  var denom = A*C - B*B;
  var baselen = Math.max(A,C);
  var aspect_ratio = 0.0001;
  var cutoff = aspect_ratio * baselen * baselen;
  if(denom > cutoff) {
    // Ok, we decided the division was safe.
    // If we hadn't said it was safe, we'd be left with mean estimates
    cx += (D*C - B*E) / denom;
    cy += (A*E - B*D) / denom;
  }

  // ok, we've got an estimate for the circle center.  Let's estimate
  // the radius and we're good to go
  var r = 0;
  for(var k=0; k<N; k++) {
    var dx = xs[k] - cx;
    var dy = ys[k] - cy;
    r += Math.sqrt(dx*dx + dy*dy);
  }
  r /= N;

  // finally, measure the RMS error to report
  var error = 0;
  for(var k=0; k<N; k++) {
    var dx = xs[k] - cx;
    var dy = ys[k] - cy;
    var diff = r - Math.sqrt(dx*dx + dy*dy);
    error += diff*diff;
  }
  error /= N;
  error = Math.sqrt(error);

  return { cx: cx, cy: cy, r: r, error: error };
}




exports.covariance_analysis = function(xys) {
  var xmean = 0;
  var ymean = 0;
  var xvar  = 0;
  var yvar  = 0;
  var covar = 0;
  var N = xys.length;

  // estimate mean
  for(var k=0; k<N; k++) {
    xmean += xys[k][0];
    ymean += xys[k][1];
  }
  xmean /= N;
  ymean /= N;

  // estimate variance
  for(var k=0; k<N; k++) {
    var dx = xys[k][0] - xmean;
    var dy = xys[k][1] - ymean;
    xvar  += dx*dx;
    yvar  += dy*dy;
    covar += dx*dy;
  }
  xvar  /= (N-1);
  yvar  /= (N-1);
  covar /= (N-1);

  // compute eigenvalues of the covariance matrix
  var det = xvar*yvar - covar*covar;
  var trace = xvar + yvar;
  var discriminant = 0.25*trace*trace - det;
  if(discriminant < 0) discriminant = 0;
  var secondterm = Math.sqrt(discriminant);
  var eigen1 = trace/2 + secondterm;
  var eigen2 = trace/2 - secondterm;

  // compute eigenvectors of the covariance matrix
  var vec1 = [ eigen1-yvar + covar, eigen1-xvar + covar ];
  var vec2 = [ eigen2-yvar + covar, eigen2-xvar + covar ];
  // if the eigenvalues are very nearly the same (i.e. w/ multiplicity)
  // then the eigenvector formulas above degenerate
  // but pretty much any orthogonal eigenvectors will suffice now.
  if(eigen1-eigen2 < eigen1*1e-4) {
    vec1 = [1,0];
    vec2 = [0,1];
  } else {
    // otherwise just normalize the eigenvectors
    var s1 = 1 / Math.sqrt(vec1[0]*vec1[0] + vec1[1]*vec1[1]);
    var s2 = 1 / Math.sqrt(vec2[0]*vec2[0] + vec2[1]*vec2[1]);
    vec1 = [s1*vec1[0], s1*vec1[1]];
    vec2 = [s1*vec2[0], s1*vec2[1]];
  }

  // results
  return {
    mean: [xmean, ymean],
    xvar: xvar,
    yvar: yvar,
    covar: covar,
    eigen1: eigen1,
    eigen2: eigen2,
    vec1: vec1,
    vec2: vec2,
  };
}

















})(typeof window === 'undefined');
