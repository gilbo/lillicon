/*  
 *  contours.js
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
var exports = on_node? module.exports : window['contours']={};

// modules
if(on_node) {
  var primitives  = require('./primitives');
} else {
  var primitives  = window.primitives;
  if(!primitives)
    throw new Error(
      "Must have Primitives Module loaded before Contours");
}

var Scalar = primitives.Scalar;
var Vec2   = primitives.Vec2;


var Polyline  = (exports.Polyline = {});
var Circle    = (exports.Circle   = {});
var Segment   = (exports.Segment  = {});
var Arc       = (exports.Arc      = Object.create(Segment));
var Bezier    = (exports.Bezier   = Object.create(Segment));
var Contour   = (exports.Contour  = {});



Polyline.New = function(ps) {
  if(!ps || !ps.length)
    throw new TypeError("Polyline.New() expects an array of Vec2 points");

  for(var k=0; k<ps.length; k++)
    if(Object.getPrototypeOf(ps[k]) !== Vec2)
      throw new TypeError(
        "the array arg to Polyline.New() must contain only Vec2s");

  var pline = Object.create(Polyline);
  pline._ps = ps.slice();
  pline._is_closed = false;
  return pline;
}
Polyline.NewClosed = function(ps) {
  var pline = Polyline.New(ps);
  pline.close();
  return pline;
}
Polyline.JSONSnapshot = function(auditor) {
  var ps = this._ps.map(auditor.receiveWith(function(pt) {
    return pt.getxy();
  }));
  return {
    points:     ps,
    is_closed:  this._is_closed,
  };
}
Polyline.fromJSONSnapshot = function(pline_snap, auditor) {
  var ps = pline_snap.points.map(auditor.dispenseWith(function(pxy) {
    return Vec2.New(pxy);
  }));
  var polyline = Polyline.New(ps);
  if(pline_snap.is_closed) polyline.close();
  return polyline;
}
Polyline.clone = function() {
  var pline = Polyline.New(this._ps);
  pline._is_closed = this._is_closed;
  return pline;
}
Polyline.isClosed = function() { return this._is_closed; }
Polyline.close = function() { this._is_closed = true; }

Polyline.points = function() {
  return this._ps.slice();
}
Polyline.forPoints = function(f) {
  this._ps.forEach(f);
}
Polyline.forEdges = function(f) {
  var lastp = this._ps[0];
  for(var k=1; k<this._ps.length; k++) {
    var p = this._ps[k];
    f(lastp,p);
    lastp = p;
  }
  if(this.isClosed() && this._ps.length > 0) {
    f(lastp,p);
  }
}
Polyline.start = function() {
  return this._ps[0];
}
Polyline.end = function() {
  return this._ps[this._ps.length-1];
}

Polyline.reverse = function() {
  var pline = this.clone();
  pline._ps.reverse();
  return pline;
}
Polyline.join = function(next_poly) {
  if(Object.getPrototypeOf(next_poly) !== Polyline)
    throw new TypeError("Polyline.join() expects a polyline as argument");
  if(this.isClosed() || next_poly.isClosed())
    throw new Error("Cannot Polyline.join() closed loops");
  if(this === next_poly)
    throw new Error("Cannot join a polyline to itself; try closing it.");

  var ps = this._ps.concat(next_poly._ps);
  var i = this._ps.length-1;
  // de-dup if the two polylines shared an endpoint
  if(ps[i] === ps[i+1]) ps.splice(i,1);

  var pline = Polyline.New(ps);
  return pline;
}



Circle.New = function(center, radius) {
  if(Object.getPrototypeOf(center) !== Vec2)
    throw new TypeError('arg 1 to Circle.New() must be a Vec2');
  if(Object.getPrototypeOf(radius) !== Scalar)
    throw new TypeError('arg 2 to Circle.New() must be a Scalar');

  var circ = Object.create(Circle);
  circ._center = center;
  circ._radius = radius;
  return circ;
}
Circle.JSONSnapshot = function(auditor) {
  var center = auditor.receiveWith(function(pt) {
    return pt.getxy();
  })(this._center);
  var radius = auditor.receiveWith(function(r) {
    return r.get();
  })(this._radius);
  return {
    center: center,
    radius: radius,
  };
}
Circle.fromJSONSnapshot = function(cjson, auditor) {
  var center = auditor.dispenseWith(function(pxy) {
    return Vec2.New(pxy);
  })(cjson.center);
  var radius = auditor.dispenseWith(function(rval) {
    return Scalar.New(rval);
  })(cjson.radius);
  var circ = Circle.New(center, radius);
  return circ;
}
Circle.center = function() {
  return this._center;
}
Circle.radius = function() {
  return this._radius;
}



Segment.isArc = function() { return false; }
Segment.isBezier = function() { return false; }
Segment.fromJSONSnapshot = function(seg_snapshot, auditor) {
  if(seg_snapshot.seg_type === 'arc') {
    return Arc.fromJSONSnapshot(seg_snapshot, auditor);
  } else { // is 'bezier'
    return Bezier.fromJSONSnapshot(seg_snapshot, auditor);
  }
}
Segment.wedgeArea = function(basept) {
  var area = 0.0;

  var xyts = this.distributeSamplesEvenly(8);
  var prevxy = Vec2.sub(xyts[0][1],basept);
  for(var k=1; k<8; k++) {
    var currxy = Vec2.sub(xyts[k][1],basept);

    area += Vec2.cross(prevxy, currxy);
    prevxy = currxy;
  }

  return area;
}
Segment.windingNumber = function(xypt) {
  var wind = 0.0;

  var xyts = this.distributeSamplesEvenly(8);
  var prevxy = Vec2.sub(xyts[0][1], xypt);
  for(var k=1; k<8; k++) {
    var currxy = Vec2.sub(xyts[k][1], xypt);

    // here we use the differential geometric definition based on
    // integrating angles
    var area    = Vec2.cross(prevxy, currxy);
    var denom   = Vec2.dot(prevxy, currxy);
    if(denom < 1e-6) denom = 1e-6;
    var angle   = Math.atan(area / denom);
    wind += angle;
    prevxy = currxy;
  }

  return wind;
}


// positive bulge is to the right of the chord extending from begin to end
// the arc will bulge by 'bulge' times the chord length
Arc.isArc = function() { return true; }
Arc.New = function(begin, handle, end) {
  if(Object.getPrototypeOf(begin) !== Vec2 ||
     Object.getPrototypeOf(handle) !== Vec2 ||
     Object.getPrototypeOf(end) !== Vec2)
    throw new TypeError('args to Arc.New() must be Vec2s');

  // compute the weight to make this an arc
  //var p0 = begin.getxy();
  //var p1 = handle.getxy();
  //var p2 = end.getxy();
  //var e02 = Vec2.sub(p2,p0);
  //var e12 = Vec2.sub(p2,p1);
  //var e10 = Vec2.sub(p0,p1);
  //var w = Vec2.len(e02) / ( Vec2.len(e12) + Vec2.len(e10) );

  var arc = Object.create(Arc);
  arc._ps = [begin, handle, end]; // rational bezier
  arc._w1 = Scalar.New();
  arc.setWfromH();
  return arc;
}
Arc.setWfromH = function() {
  // compute the weight to make this an arc
  var p0  = this._ps[0].getxy();
  var p1  = this._ps[1].getxy();
  var p2  = this._ps[2].getxy();
  var e02 = Vec2.sub(p2,p0);
  var e12 = Vec2.sub(p2,p1);
  var e10 = Vec2.sub(p0,p1);
  var w = Vec2.len(e02) / ( Vec2.len(e12) + Vec2.len(e10) );
  this._w1.set(w);
}
Arc.p = function(k) {
  return this._ps[k];
}
Arc.w  = function() { return this._w1; }
// access particular points, anchors and handles at t=0 and t=1
Arc.a0 = function() { return this._ps[0]; }
Arc.a1 = function() { return this._ps[2]; }
Arc.h0 = function() { return this._ps[1]; }
Arc.h1 = function() { return this._ps[1]; }
Arc.h  = function() { return this._ps[1]; }
Arc.JSONSnapshot = function(auditor) {
  var ps = this._ps.map(auditor.receiveWith(function(pt) {
    return pt.getxy();
  }));
  return {
    seg_type: 'arc',
    points:   ps,
  };
}
Arc.fromJSONSnapshot = function(arc_snapshot, auditor) {
  var ps = arc_snapshot.points.map(auditor.dispenseWith(function(pxy) {
    return Vec2.New(pxy);
  }));
  return Arc.New(ps[0], ps[1], ps[2]);
}
Arc.reverse = function() {
  var a = Object.create(Arc);
  a._ps = this._ps.slice().reverse();
  a._w1 = this._w1;
  return a;
}
Arc._point_set = function() {
  return new Set(this._ps);
}
Arc.testEval = function(t) {
  var ps = [];
  for(var k=0; k<3; k++) ps[k] = this._ps[k].getxy();

  // we're evaluating a rational Bezier curve here with one weight parameter
  // on P1, the other weights are fixed to be 1 each
  var t1 = 1-t;
  var w = this._w1.get();
  var c = [ t1*t1, 2*w*t*t1, t*t ];
  var N = c[0] + c[1] + c[2]; // normalization value
  var res = [0,0];
  for(var k=0; k<3; k++)
    res = Vec2.add(res, Vec2.mul(c[k]/N, ps[k]));

  return res;
}
Arc.getMid = function() {
  return Vec2.New(this.testEval(0.5));
}
Arc.toBezier = function() {
  // we derive this approximation by forcing the midpoints of the two
  // curves to match
  // The key scaling parameter we get as
  var w = this._w1.get();
  var beta = (4.0/3.0) * w / (1+w);
  var ap0 = this._ps[0].getxy();
  var ap1 = this._ps[1].getxy();
  var ap2 = this._ps[2].getxy();
  var ae01 = Vec2.sub(ap1,ap0);
  var ae21 = Vec2.sub(ap1,ap2);
  var bp1 = Vec2.add(ap0, Vec2.mul(beta, ae01));
  var bp2 = Vec2.add(ap2, Vec2.mul(beta, ae21));

  var p0 = this._ps[0];
  var p1 = Vec2.New(bp1);
  var p2 = Vec2.New(bp2);
  var p3 = this._ps[2];

  return Bezier.New(p0,p1,p2,p3);
}
Arc.curveLength = function() {
  // if we know the radius and angle of the arc, then
  // the answer is r*theta
  // the chord's length is 2*r*sin(theta/2)
  // which means theta = 2* ARCSIN[ chord / 2r ]
  // SO length = 2r ARCSIN [ chord*curvature / 2 ]

  var curvature = this.getCurvature();
  var chord = Vec2.len(Vec2.sub(this._ps[2].getxy(), this._ps[0].getxy()));

  // DETAIL: If curvature is tiny, then estimate will fail.
  //          Use a linear approximation instead
  if(curvature < 1e-6) return chord;

  var length = 2 * (1/curvature) * Math.asin(chord*curvature * 0.5);
  return length;
}
Arc.distributeSamplesEvenly = function(N) {
  var xyts = [];
  for(var k=1; k<N+1; k++) {
    var t = k/(N+1);
    xyts[k-1] = [t, this.testEval(t)];
  }
  return xyts;
}
// using similar right triangles, we derive that
//    R = B*E / SQRT(4E*E - B*B)
// where B is the distance between the two anchors
// and E is the distance from either anchor to the handle point
function compute_arc_radius_components(p0,p1,p2) {
  var B2 = Vec2.len2(Vec2.sub(p2,p0));
  var E2 = ( Vec2.len2(Vec2.sub(p1,p0)) + Vec2.len2(Vec2.sub(p1,p2)) ) / 2.0;
  var B  = Math.sqrt(B2);
  var E  = Math.sqrt(E2);

  return [ B*E, Math.sqrt(4*E2 - B2) ];
}
Arc.getCurvature = function() {
  var p0 = this.a0().getxy();
  var p1 = this.h().getxy();
  var p2 = this.a1().getxy();
  var q = compute_arc_radius_components(p0,p1,p2);
  var curvature = q[1] / q[0];
  return curvature;
}
Arc.getCircleRadius = function() {
  var p0 = this.a0().getxy();
  var p1 = this.h().getxy();
  var p2 = this.a1().getxy();
  var q = compute_arc_radius_components(p0,p1,p2);
  var radius = q[0] / q[1];
  return radius;
}
Arc.getCircle = function(max_radius) {
  var radius = this.getCircleRadius();
  if(radius > max_radius) return null;

  var p0 = this.a0().getxy();
  var p1 = this.h().getxy();
  var p2 = this.a1().getxy();

  // offset the handle point by the appropriate amount in the direction
  // perpendicular to the baseline
  var base      = Vec2.sub(p2,p0);
  var perpnorm  = Vec2.mul(1.0/Vec2.len(base), [ -base[1], base[0] ]);
  if( Vec2.dot( perpnorm, Vec2.sub(p2,p1) ) < 0 )
    perpnorm = [-perpnorm[0],-perpnorm[1]]; // flip if needed
  // we want to offset by SQRT(E*E + R*R)
  var E2 = ( Vec2.len2(Vec2.sub(p1,p0)) + Vec2.len2(Vec2.sub(p1,p2)) ) / 2.0;
  var R2 = radius*radius;
  var center = Vec2.add( p1, Vec2.mul(Math.sqrt(E2 + R2), perpnorm) );
  return Circle.New( Vec2.New(center), Scalar.New(radius) );
}
function arc_decasteljau_split_t(t,P0,P1,P2,W) {
  var t1 = 1-t;

  var X00 = P0[0];       var Y00 = P0[1];       var W00 = 1;
  var X01 = P1[0];       var Y01 = P1[1];       var W01 = W;
  var X02 = P2[0];       var Y02 = P2[1];       var W02 = 1;

  var W10 = t1*W00 + t*W01;       var invW10 = 1/W10;
  var W11 = t1*W01 + t*W02;       var invW11 = 1/W11;
  var X10 = invW10 * (t1*W00*X00 + t*W01*X01);
  var Y10 = invW10 * (t1*W00*Y00 + t*W01*Y01);
  var X11 = invW11 * (t1*W01*X01 + t*W02*X02);
  var Y11 = invW11 * (t1*W01*Y01 + t*W02*Y02);

  var W20 = t1*W10 + t*W11;       var invW20 = 1/W20;
  var X20 = invW20 * (t1*W10*X10 + t*W11*X11);
  var Y20 = invW20 * (t1*W10*Y10 + t*W11*Y11);

  console.log(
    [X00,Y00], [X10,Y10], [X20,Y20],
    [X20,Y20], [X11,Y11], [X02,Y02]
  );
  return [
    [ [X00,Y00], [X10,Y10], [X20,Y20] ],
    [ [X20,Y20], [X11,Y11], [X02,Y02] ],
  ];
}
Arc.split = function(t) {
  var P0 = this._ps[0].getxy();
  var P1 = this._ps[1].getxy();
  var P2 = this._ps[2].getxy();
  var W  = this._w1.get();
  var split_coords = arc_decasteljau_split_t(t,P0,P1,P2,W);
  var A0pts = split_coords[0].map(function(p) { return Vec2.New(p); });
  var A1pts = split_coords[1].map(function(p) { return Vec2.New(p); });
  // now use shared points where possible
  A0pts[0] = this._ps[0];
  A1pts[2] = this._ps[2];
  A1pts[0] = A0pts[2];
  // and construct the two Arcs
  var A0 = Arc.New(A0pts[0], A0pts[1], A0pts[2]);
  var A1 = Arc.New(A1pts[0], A1pts[1], A1pts[2]);
  return [A0,A1];
}


Bezier.isBezier = function() { return true; }
Bezier.New = function(p0, p1, p2, p3) {
  if(!Vec2.isPrototypeOf(p0) ||
     !Vec2.isPrototypeOf(p1) ||
     !Vec2.isPrototypeOf(p2) ||
     !Vec2.isPrototypeOf(p3))
  {
    throw new TypeError("args to Bezier.New() must be 4 Vec2");
  }

  var b = Object.create(Bezier);
  b._ps = [p0,p1,p2,p3];
  return b;
}
Bezier.p = function(k) {
  return this._ps[k];
}
// access particular points, anchors and handles at t=0 and t=1
Bezier.a0 = function() { return this._ps[0]; }
Bezier.a1 = function() { return this._ps[3]; }
Bezier.h0 = function() { return this._ps[1]; }
Bezier.h1 = function() { return this._ps[2]; }
Bezier._point_set = function() {
  return new Set(this._ps);
}
Bezier.JSONSnapshot = function(auditor) {
  var ps = this._ps.map(auditor.receiveWith(function(pt) {
    return pt.getxy();
  }));
  return {
    seg_type: 'bezier',
    points:   ps,
  };
}
Bezier.fromJSONSnapshot = function(bz_snapshot, auditor) {
  if(!bz_snapshot)
  { var err = new Error('debug here');
    console.log(err);
    throw err; }
  var ps = bz_snapshot.points.map(auditor.dispenseWith(function(pxy) {
    return Vec2.New(pxy);
  }));
  return Bezier.New(ps[0], ps[1], ps[2], ps[3]);
}
Bezier.reverse = function() {
  var b = Object.create(Bezier);
  b._ps = this._ps.slice().reverse();
  return b;
}
Bezier.testEval = function(t) {
  var x = [];
  var y = [];
  for (var k=0; k<4; k++) {
    x[k] = this._ps[k].x().get();
    y[k] = this._ps[k].y().get();
  }
  // for four control points
  // B(t) = (1-t)^3 p0 + 3t(1-t)^2 p1 + 3t^2(1-t) p2 + t^3 p3
  var t1 = 1-t;
  var c = [t1*t1*t1,
           3*t*t1*t1,
           3*t*t*t1,
           t*t*t];
  var bx = 0;
  var by = 0;
  for(var k=0; k<4; k++) {
    bx += c[k] * x[k];
    by += c[k] * y[k];
  }
  return [bx,by];
}
Bezier.toBezier = function() { return this; }

// De Casteljau
function decasteljau_t_split(t, P0, P1, P2, P3) {
  var t1 = 1-t;

  // build the pyramid of recursive evaluations
  var X00 = P0[0];              var Y00 = P0[1];
  var X01 = P1[0];              var Y01 = P1[1];
  var X02 = P2[0];              var Y02 = P2[1];
  var X03 = P3[0];              var Y03 = P3[1];

  var X10 = t1*X00 + t*X01;     var Y10 = t1*Y00 + t*Y01;
  var X11 = t1*X01 + t*X02;     var Y11 = t1*Y01 + t*Y02;
  var X12 = t1*X02 + t*X03;     var Y12 = t1*Y02 + t*Y03;

  var X20 = t1*X10 + t*X11;     var Y20 = t1*Y10 + t*Y11;
  var X21 = t1*X11 + t*X12;     var Y21 = t1*Y11 + t*Y12;

  var X30 = t1*X20 + t*X21;     var Y30 = t1*Y20 + t*Y21;

  return [
    [ [X00,Y00], [X10,Y10], [X20,Y20], [X30,Y30] ],
    [ [X30,Y30], [X21,Y21], [X12,Y12], [X03,Y03] ],
  ];
}
function decasteljau_half_split(P0, P1, P2, P3) {
  // build the pyramid of recursive evaluations
  var X00 = P0[0];              var Y00 = P0[1];
  var X01 = P1[0];              var Y01 = P1[1];
  var X02 = P2[0];              var Y02 = P2[1];
  var X03 = P3[0];              var Y03 = P3[1];

  var X10 = 0.5*(X00 + X01);    var Y10 = 0.5*(Y00 + Y01);
  var X11 = 0.5*(X01 + X02);    var Y11 = 0.5*(Y01 + Y02);
  var X12 = 0.5*(X02 + X03);    var Y12 = 0.5*(Y02 + Y03);

  var X20 = 0.5*(X10 + X11);    var Y20 = 0.5*(Y10 + Y11);
  var X21 = 0.5*(X11 + X12);    var Y21 = 0.5*(Y11 + Y12);

  var X30 = 0.5*(X20 + X21);    var Y30 = 0.5*(Y20 + Y21);

  return [
    [ [X00,Y00], [X10,Y10], [X20,Y20], [X30,Y30] ],
    [ [X30,Y30], [X21,Y21], [X12,Y12], [X03,Y03] ],
  ];
}
// Gravesen approximation from
// From http://steve.hollasch.net/cgindex/curves/cbezarclen.html
function gravesen_length_appx(P0,P1,P2,P3, epsilon, depth_cutoff) {
  var L01 = Vec2.len(Vec2.sub(P1,P0));
  var L12 = Vec2.len(Vec2.sub(P2,P1));
  var L23 = Vec2.len(Vec2.sub(P3,P2));
  var L03 = Vec2.len(Vec2.sub(P3,P0));
  // upper bound
  var envelope = L01 + L12 + L23;
  // lower bound
  var chord = L03;

  // recurse if the error is too large
  if(envelope-chord > epsilon && depth_cutoff > 0) {
    var split = decasteljau_half_split(P0,P1,P2,P3);
    var len0 = gravesen_length_appx(
      split[0][0], split[0][1], split[0][2], split[0][3],
      0.5*epsilon, depth_cutoff-1
    );
    var len1 = gravesen_length_appx(
      split[1][0], split[1][1], split[1][2], split[1][3],
      0.5*epsilon, depth_cutoff-1
    );
    return len0 + len1;
  } else {
    return 0.5*(envelope+chord); // take avg as appx.
  }
}
Bezier.curveLength = function(epsilon, depth_cutoff) {
  var P0 = this._ps[0].getxy();
  var P1 = this._ps[1].getxy();
  var P2 = this._ps[2].getxy();
  var P3 = this._ps[3].getxy();

  epsilon = epsilon || 0.0001;
  depth_cutoff = depth_cutoff || 3;
  return gravesen_length_appx(P0,P1,P2,P3, epsilon, depth_cutoff);
}
Bezier.hasAppxNoHandles = function(epsilon) {
  var P0 = this._ps[0].getxy();
  var P1 = this._ps[1].getxy();
  var P2 = this._ps[2].getxy();
  var P3 = this._ps[3].getxy();
  var base = Vec2.sub(P3,P0);
  var baselen = Vec2.len(base);

  if(epsilon === undefined) {
    epsilon = 1e-4 * baselen; // pretty much a safe value...
  }

  if( Vec2.len(Vec2.sub(P1,P0)) <= epsilon &&
      Vec2.len(Vec2.sub(P2,P3)) <= epsilon )
    return true;
  return false;
}
Bezier.distributeSamplesEvenly = function(N) {
  var ts   = [];  // sample naively to build a piecewise linear
                  // approximation for guiding further sampling
  var lens  = [];
  var total_len = 0;

  var last_pt = this.a0().getxy();
  ts[0] = 0;
  for(var k=1; k<N+1; k++) {
    ts[k]     = k/(N+1);
    var pt    = this.testEval(ts[k]);
    lens[k-1] = Vec2.len(Vec2.sub(pt, last_pt));
    total_len += lens[k-1];
    last_pt = pt;
  }
  ts[N+1]   = 1;
  lens[N]   = Vec2.len(Vec2.sub(this.a1().getxy(), last_pt));
  total_len += lens[N];

  // Now, do the actual sampling by running through the previous list
  var xyts = [];
  var i = 0;
  var frac = lens[i] / total_len;
  var consumed = 0;
  for(var k=1; k<N+1; k++) {
    var idealt = k/(N+1);
    // advance to the next segment that will suffice
    while(idealt > consumed + frac) {
      consumed += frac;
      i++;
      frac = lens[i] / total_len;
    }
    // now figure out the actual parameter value to sample at
    var interp = (idealt-consumed)/frac;
    var actualt = (1-interp)*ts[i] + interp*ts[i+1];

    xyts[k-1] = [actualt, this.testEval(actualt)];
  }
  return xyts;
}
Bezier.split = function(t) {
  // Special Straight Line Case:
  if(this.hasAppxNoHandles()) {
    var m = this.testEval(t);
    var midpt = Vec2.New(m);
    var B0 = Bezier.New(this.a0(), this.h0(), Vec2.New(m), midpt);
    var B1 = Bezier.New(midpt, Vec2.New(m), this.h1(), this.a1());
    console.log('appxhandles', B0.hasAppxNoHandles(), B1.hasAppxNoHandles());
    return [B0,B1];
  }

  // Standard Case:
  var P0 = this._ps[0].getxy();
  var P1 = this._ps[1].getxy();
  var P2 = this._ps[2].getxy();
  var P3 = this._ps[3].getxy();
  var split_coords = decasteljau_t_split(t, P0,P1,P2,P3);
  var B0pts = split_coords[0].map(function(p) { return Vec2.New(p); });
  var B1pts = split_coords[1].map(function(p) { return Vec2.New(p); });
  // now use shared points where possible
  B0pts[0] = this._ps[0];
  B1pts[3] = this._ps[3];
  B1pts[0] = B0pts[3];
  // and construct the two Beziers
  var B0 = Bezier.New(B0pts[0], B0pts[1], B0pts[2], B0pts[3]);
  var B1 = Bezier.New(B1pts[0], B1pts[1], B1pts[2], B1pts[3]);
  return [B0,B1];
}



// helper for brevity
function contour_new(segs, closed) {
  var c = Object.create(Contour);
  c._segs = segs;
  c._is_closed = closed;
  return c;
}
Contour.New = function(segs) {
  var c = Contour.NewOpen(segs);

  // check that it ends where it began; a closed contour
  var p_init = c._segs[0].a0();
  var p_final = c._segs[c._segs.length-1].a1();
  if(p_init !== p_final) {
    throw new Error(
      "the first and last point in a contour must be identical!");
  }

  c._is_closed = true;
  return c;
}
Contour.NewOpen = function(segs) {
  if(!segs || !segs.length) {
    throw new TypeError("must supply array of Segments to Contour.New()");
  }
  for(var k=0; k<segs.length; k++)
    if(!Segment.isPrototypeOf(segs[k]))
      throw new TypeError(
        "the array arg to Contour.New() must contain only Segments");

  // check that the contour is continuous
  for(var k=1; k<segs.length; k++) {
    var prev = segs[k-1].a1();
    var curr = segs[k].a0();
    if(prev !== curr)
      throw new Error("Contours must be continuous, so the last and first "+
        "points of subsequent Bezier Curves must be identical");
  }

  return contour_new(segs.slice(), false);
}
Contour.JSONSnapshot = function(auditor) {
  var segs = this._segs.map(auditor.receiveWith(function(seg) {
    return seg.JSONSnapshot(auditor);
  }));
  return {
    segments: segs,
    is_closed: this._is_closed,
  };
}
Contour.fromJSONSnapshot = function(csnapshot, auditor) {
  var segs = csnapshot.segments.map(auditor.dispenseWith(function(sjson) {
    return Segment.fromJSONSnapshot(sjson, auditor);
  }))
  var c = Contour.NewOpen(segs);
  c._is_closed = csnapshot.is_closed;
  return c;
}

Contour.isClosed = function() { return this._is_closed };
Contour.close = function() {
  // check that it ends where it began; a closed contour
  var p_init = this._segs[0].a0();
  var p_final = this._segs[this._segs.length-1].a1();
  if(p_init !== p_final) {
    throw new Error(
      "the first and last point in a contour must be identical in order "+
      "to close the contour!");
  }

  this._is_closed = true;
}

Contour._point_set = function() {
  return this._segs.mapUnion(function(s) {
    return s._point_set();
  });
}
Contour._anchor_set = function() {
  return this._segs.mapUnion(function(s) {
    return new Set([s.a0()]);
  });
}

Contour.split = function(point) {
  // handle edge case where the split occurs at the beginning/end
  if(this.firstSeg().a0() === point ||
     this.lastSeg().a1() === point
  ) {
    if(!this.isClosed())
      throw new Error("INTENTIONALLY UNHANDLED: "+
        "Don't split an open contour at the start or end.");
    // we know 'this' is closed now, return it opened up
    return [contour_new(this._segs.slice(), false)];
  }

  var split_i;
  for(var k=1; k<this._segs.length; k++) {
    if(this._segs[k].a0() === point) {
      split_i = k;
      break;
    }
  }
  if(!split_i)
    throw new Error("Did not find a point to split by in the contour...");

  var half1 = this._segs.slice(0,split_i);
  var half2 = this._segs.slice(split_i);
  if(this.isClosed()) {
    return [ contour_new(half2.concat(half1), false) ];
  }
  else {
    return [ contour_new(half1, false), contour_new(half2, false) ];
  }
}
Contour.join = function(rhs) {
  if(this.isClosed() || rhs.isClosed()) {
    throw new Error("Cannot join closed contours together");
  }

  if(this.lastSeg().a1() !== rhs.firstSeg().a0()) {
    throw new Error("Can only join two contours if the final endpoint of "+
      "the first contour matches the inital endpoint of the second contour");
  }

  return contour_new(this._segs.concat(rhs._segs), false);
}
Contour.reverse = function() {
  var c = Object.create(Contour);
  c._segs = this._segs.map(function(s) {
    return s.reverse();
  });
  c._segs.reverse(); // Array reverse
  c._is_closed = this._is_closed;
  return c;
}

Contour.segments = function() {
  return this._segs.slice();
}
Contour.firstSeg = function() {
  return this._segs[0];
}
Contour.lastSeg = function() {
  return this._segs[this._segs.length-1];
}

Contour.signedArea = function() {
  if(!this.isClosed()) return;

  // otherwise, choose an arbitrary point to sum from (i.e. 0,0)
  var basept = [0,0];
  var area = 0.0;
  for(var k=0; k<this._segs.length; k++) {
    area += this._segs[k].wedgeArea(basept);
  }

  return area;
}
Contour.windingNumber = function(xypt, noround) {
  if(!this.isClosed()) return 0;

  var windsum = 0.0;
  for(var k=0; k<this._segs.length; k++) {
    windsum += this._segs[k].windingNumber(xypt);
  }
  windsum /= 2.0 * Math.PI;
  if(noround) { return windsum; }
  return Math.round(windsum)
}







Contour.draw = function(drawAPI) {
  // set the pen at the beginning
  var p0 = this.firstSeg().a0();
  drawAPI.moveTo( p0.x().get(), p0.y().get() );

  // potentially eating up computation/time needlessly...
  var bzs = this._segs.map(function(s) { return s.toBezier(); });

  // trace each segment
  for(var k=0; k<bzs.length; k++) {
    var cp1 = bzs[k].h0();
    var cp2 = bzs[k].h1();
    var p   = bzs[k].a1();

    drawAPI.bezierCurveTo(
      cp1.x().get(), cp1.y().get(),
      cp2.x().get(), cp2.y().get(),
      p.x().get(), p.y().get()
    );
  }
}

Polyline.draw = function(drawAPI) {
  // set the pen at the beginning
  var p0 = this.start();
  drawAPI.moveTo( p0.x().get(), p0.y().get() );

  for(var k=1; k<this._ps.length; k++) {
    var p = this._ps[k];
    drawAPI.lineTo( p.x().get(), p.y().get() );
  }
}



if(typeof paper !== 'undefined') {
  function sub(a,b) {
    return new paper.Point([ a.x - b.x, a.y - b.y ]);
  }
  Contour.paper = function() {
    // NOTE: We have to convert to get the right handle positions
    // for arcs, so we can't just read off the arc handle into
    // Paper segments.
    var beziers = this._segs.map(function(s) { return s.toBezier(); });
    var papersegs = []; // for constructing a paper curve

    var lastbz = beziers[beziers.length-1];
    var handleIn = sub(lastbz.p(2).paper(), lastbz.p(3).paper());
    for(var k=0; k<beziers.length; k++) {
      var bz = beziers[k];
      var anchor = bz.p(0).paper();
      var handleOut = sub(bz.p(1).paper(), anchor);

      papersegs.push(new paper.Segment(anchor, handleIn, handleOut));

      handleIn = sub(bz.p(2).paper(), bz.p(3).paper());
    }

    // paper path
    var path = new paper.Path(papersegs);
    path.closed = true;
    return path;
  }

  Polyline.paper = function() {
    var points = [];

    for(var k=0; k<this._ps.length; k++) {
      var p = this._ps[k];
      points.push(p.paper());
    }

    var path = new paper.Path(points);
    path.closed = this.isClosed();
    return path;
  }
}






// Note: see paper docs for how to get clockwise/closed/other properties
// have to see whether or not we want to snap first and last point on
// curves when reading in because... YEAH


})(typeof window === 'undefined');
