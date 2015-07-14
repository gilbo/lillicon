/*  
 *  analysis.js
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
var exports = on_node? module.exports : window['analysis']={};

// modules
if(on_node) {
  var primitives  = require('./primitives');
  var contours    = require('./contours');
  var planarmap   = require('./planarmap');
  var constraints = require('./constraints');
  var numeric_subroutines = require('./numeric_subroutines');
} else {
  var primitives  = window.primitives;
  var contours    = window.contours;
  var planarmap   = window.planarmap;
  var constraints = window.constraints;
  var numeric_subroutines = window.numeric_subroutines;
  if(!primitives || !contours || !planarmap ||
     !constraints || !numeric_subroutines)
    throw new Error(
      "Must have Primitives, Contours, PlanarMap, Constraints, & "+
      "Numeric Subroutines Modules loaded before Analysis");
}


// IMPORTS
var Scalar        = primitives.Scalar;
var Vec2          = primitives.Vec2;
var Bezier        = contours.Bezier;
var Arc           = contours.Arc;
var Polyline      = contours.Polyline;
var Contour       = contours.Contour;
var Circle        = contours.Circle;
var PlanarMap     = planarmap.PlanarMap;

var BzSample      = constraints.BzSample;
var ArcSample     = constraints.ArcSample;
var Bisector      = constraints.Bisector;
var ArcWeight     = constraints.ArcWeight;
var Colinear      = constraints.Colinear;
var EqualPt       = constraints.EqualPt;
var EqualNum      = constraints.EqualNum;
var OnCircle      = constraints.OnCircle;
var Average       = constraints.Average;

var fit_circle    = numeric_subroutines.fit_circle;


var SIN_1_DEG = Math.sin(Math.PI / 180.0);


// DECLARATIONS
var Analysis      = {};
var AContour      = {};

var ASegment      = {};
var ABezier       = Object.create(ASegment);
var AArc          = Object.create(ASegment);
//var ALine         = Object.create(ASegment);

exports.Analysis = Analysis;


// IMPLEMENTATIONS
ASegment.New = function(seg) {
  if(seg.isArc())     return AArc.New(seg);
  if(seg.isBezier())  return ABezier.New(seg);
}
ASegment.fromJSONSnapshot = function(asegjson, auditor) {
  if(asegjson.seg_type === 'arc')
    return AArc.fromJSONSnapshot(asegjson, auditor);
  else // === bezier
    return ABezier.fromJSONSnapshot(asegjson, auditor);
}
ASegment.isArc = function() { return false; }
ASegment.isBezier = function() { return false; }

// requires that samples have been tagged with
// samp._analysis_sample_split_me = true
ASegment.splitAtSamples = function() {
  var Nsamp = this._samples.length;
  var split_ts = [];
  var split_samps = [];
  for(var k=0; k<Nsamp; k++) {
    if(this._samples[k]._analysis_sample_split_me) {
      split_ts.push(this._sample_ts[k]);
      split_samps.push(this._samples[k]);
    }
  }
  if(split_ts.length === 0) return [this.seg()]; // done

  // otherwise, prepare to split
  // TODO: This repeated splitting is a bit numerically iffy...
  var adjusted_ts = [split_ts[0]];
  for(var k=1; k<split_ts.length; k++) {
    adjusted_ts[k] = (split_ts[k]-split_ts[k-1]) / (1-split_ts[k-1]);
  }
  console.log('adjusted to ', split_ts, adjusted_ts);
  // split the underlying drawing
  var seg = this.seg();
  var subsegs = [];
  for(var k=0; k<adjusted_ts.length; k++) {
    var segpair = seg.split(adjusted_ts[k]);
    var s0 = segpair[0]; var s1 = segpair[1];

    // substitute the split point with the sample to simplify later manip.
    var samp = split_samps[k];
    if(this.isArc()) {
      s0 = Arc.New(s0.a0(), s0.h(), samp);
      s1 = Arc.New(samp,    s1.h(), s1.a1());
    }
    else if(this.isBezier()) {
      if(seg.hasAppxNoHandles()) { // special case to avoid numeric issues
        var sampxy = samp.getxy();
        s0 = Bezier.New(s0.a0(), s0.h0(),       Vec2.New(sampxy), samp);
        s1 = Bezier.New(samp, Vec2.New(sampxy), s1.h1(), s1.a1());
      }
      else {
        s0 = Bezier.New(s0.a0(), s0.h0(), s0.h1(), samp);
        s1 = Bezier.New(samp,    s1.h0(), s1.h1(), s1.a1());
      }
    }
    else throw new Error('unknown Segment Type!');

    subsegs[k] = s0;
    seg = s1;
  }
  subsegs.push(seg);

  // just return the raw underlying pieces...
  return subsegs;
}



ABezier.isBezier = function() { return true; }
ABezier.New = function(bz) {
  var abz = Object.create(ABezier);
  abz._bz = bz;
  abz._samples = [];
  abz._sample_ts = [];
  abz._constraints = [];
  return abz;
}
ABezier.JSONSnapshot = function(auditor) {
  var bz = auditor.receiveWith(function(bz) {
    throw new Error('should have already snapshotted the arc');
  })(this._bz);
  var samples = this._samples.map(auditor.receiveWith(function(pt) {
    return pt.getxy();
  }));
  var sample_ts = this._sample_ts.slice();

  // include various properties too
  return {
    seg_type:         'bz',
    bz:               bz,
    samples:          samples,
    sample_ts:        sample_ts,
    has_begin:        this._has_begin_handle,
    has_end:          this._has_end_handle,
    is_straight:      this._is_straight_line,
    is_horizontal:    this._is_horizontal,
    is_vertical:      this._is_vertical,
    a0G0_continuous:  this._a0_G0_continuous,
    a0C0_continuous:  this._a0_C0_continuous,
  };
}
ABezier.fromJSONSnapshot = function(abzjson, auditor) {
  var bz = auditor.dispenseWith(function(bzjson) {
    return Bezier.fromJSONSnapshot(bzjson, auditor);
  })(abzjson.bz);
  var samples = abzjson.samples.map(auditor.dispenseWith(function(pxy) {
    return Vec2.New(pxy);
  }));
  var sample_ts = abzjson.sample_ts.slice();

  var abz = ABezier.New(bz);
  abz._samples = samples;
  abz._sample_ts = sample_ts;

  // various properties
  abz._has_begin_handle = abzjson.has_begin;
  abz._has_end_handle   = abzjson.has_end;
  abz._is_straight_line = abzjson.is_straight;
  abz._is_horizontal    = abzjson.is_horizontal;
  abz._is_vertical      = abzjson.is_vertical;
  abz._a0_G0_continuous = abzjson.a0G0_continuous;
  abz._a0_C0_continuous = abzjson.a0C0_continuous;

  // add constraints for samples
  for(var k=0; k<samples.length; k++)
    abz._constraints.push(BzSample.New(bz, samples[k], sample_ts[k]));

  return abz;
}
ABezier.bz = function() { return this._bz; };
ABezier.seg = function() { return this._bz; };
ABezier.samples = function() {
  return this._samples;
}
ABezier.constraints = function() {
  return this._constraints; // UNSAFE: No shallow copy
}
ABezier.addSample = function(pt, t) {
  this._samples.push(pt);
  this._sample_ts.push(t);
  this._constraints.push(BzSample.New(this._bz, pt, t));
}

function is_straight(bz, has_h0, has_h1, globals) {
  var p0 = bz.p(0).getxy();
  var p1 = bz.p(1).getxy();
  var p2 = bz.p(2).getxy();
  var p3 = bz.p(3).getxy();

  var base = Vec2.sub(p3,p0);
  var base_len = Vec2.len(base);
  var EPS = globals.EPSILON;

  // handles must lie within EPS of the line and point towards the other anchor
  var h0 = Vec2.sub(p1,p0)
  var h0dot = Vec2.dot(h0, base);
  var h0cross = Math.abs(Vec2.cross(h0,base));
  var h0_straight = !has_h0 || ( h0dot >= 0 && h0cross < EPS * base_len);

  var h1 = Vec2.sub(p2,p3);
  h1dot = Vec2.dot(h1, base);
  var h1cross = Math.abs(Vec2.cross(h1,base));
  var h1_straight = !has_h1 || ( h1dot <= 0 && h1cross < EPS * base_len);

  return h0_straight && h1_straight;
}

// do all per-Bezier analysis
ABezier.analyzeAlone = function(globals) {
  var bz = this._bz;
  var EPSILON = globals.EPSILON;

  // determine whether or not the handles are present
  //var has_h0 = !EqualPt.test(bz.h0(), bz.a0(), EPSILON);
  //var has_h1 = !EqualPt.test(bz.h1(), bz.a1(), EPSILON);
  this._has_begin_handle  = !EqualPt.test(bz.h0(), bz.a0(), EPSILON);
  this._has_end_handle    = !EqualPt.test(bz.h1(), bz.a1(), EPSILON);

  // enforce constraints on whether the handles are present
//  if(!has_h0)
//    this._constraints.push(EqualPt.New(bz.h0(), bz.a0()));
//  if(!has_h1)
//    this._constraints.push(EqualPt.New(bz.h1(), bz.a1()));

  // detecting straight lines a bit overly conservatively here
  // it might still be straight even with handles present
  this._is_straight_line =
    is_straight(bz, this._has_begin_handle, this._has_end_handle, globals);

  // determine points defining tangency
//  this._begin_tangent = (has_h0)? bz.h0() : null;
//  this._end_tangent   = (has_h1)? bz.h1() : null;
//  if(this._is_straight_line) {
//    this._begin_tangent = bz.a1();
//    this._end_tangent = bz.a0();
//    if(has_h0)
//      this._constraints.push(Colinear.New(bz.a0(), bz.h0(), bz.a1()));
//    if(has_h1)
//      this._constraints.push(Colinear.New(bz.a0(), bz.h1(), bz.a1()));
//  }

  // if this is straight and horizontal or vertical...
  if(this._is_straight_line) {
    var p0 = bz.a0().getxy();
    var p1 = bz.a1().getxy();
    var d = Vec2.sub(p1,p0);

    this._is_horizontal = Math.abs(d[1]) < EPSILON;
    this._is_vertical   = Math.abs(d[0]) < EPSILON;

//    if(is_horizontal) {
//      // hack to make constraint stronger
//      var y = Scalar.New(p0[1]);
//      this._horizontal_guide_var = y;
//      this._constraints.push(EqualNum.New(bz.a0().y(), y));
//      this._constraints.push(EqualNum.New(bz.a1().y(), y));
//      for(var k=0; k<this._samples.length; k++)
//        this._constraints.push(EqualNum.New(this._samples[k].y(), y));
//    }
//    if(is_vertical) {
//      // hack to make constraint stronger
//      var x = Scalar.New(p0[0]);
//      this._vertical_guide_var = x;
//      this._constraints.push(EqualNum.New(bz.a0().x(), x));
//      this._constraints.push(EqualNum.New(bz.a1().x(), x));
//      for(var k=0; k<this._samples.length; k++)
//        this._constraints.push(EqualNum.New(this._samples[k].x(), x));
//    }
  }
}
ABezier.buildConstraintsAlone = function() {
  var bz = this.bz();

  // enforce constraints keeping absent/trivial handles trivial
  if(!this.h0Exists())
    this._constraints.push(EqualPt.New(bz.h0(), bz.a0()));
  if(!this.h1Exists())
    this._constraints.push(EqualPt.New(bz.h1(), bz.a1()));

  // enforce straightness when the handles are non-trivial
  if(this._is_straight_line) {
    if(this._has_begin_handle)
      this._constraints.push(Colinear.New(bz.a0(), bz.h0(), bz.a1()));
    if(this._has_end_handle)
      this._constraints.push(Colinear.New(bz.a0(), bz.h1(), bz.a1()));
  }

  // enforce horizontal/vertical-ness
  if(this._is_straight_line) {
    if(this._is_horizontal) {
      var y = this.horizontalGuide();
      this._constraints.push(EqualNum.New(bz.a0().y(), y));
      this._constraints.push(EqualNum.New(bz.a1().y(), y));
      // hack to make constraint stronger
      for(var k=0; k<this._samples.length; k++)
        this._constraints.push(EqualNum.New(this._samples[k].y(), y));
    }
    if(this._is_vertical) {
      var x = this.verticalGuide();
      this._constraints.push(EqualNum.New(bz.a0().x(), x));
      this._constraints.push(EqualNum.New(bz.a1().x(), x));
      // hack to make constraint stronger
      for(var k=0; k<this._samples.length; k++)
        this._constraints.push(EqualNum.New(this._samples[k].x(), x));
    }
  }
}

ABezier.h0Exists      = function() { return this._has_begin_handle; }
ABezier.h1Exists      = function() { return this._has_end_handle; }
ABezier.isStraight    = function() { return this._is_straight_line; }
ABezier.beginTangent  = function() {
  if(this._begin_tangent === undefined) {
    if(this._is_straight_line)
      this._begin_tangent = this._bz.a1();
    else
      this._begin_tangent = (this.h0Exists())? this._bz.h0() : null;
  }
  return this._begin_tangent;
}
ABezier.endTangent    = function() {
  if(this._end_tangent === undefined) {
    if(this._is_straight_line)
      this._end_tangent = this._bz.a0();
    else
      this._end_tangent = (this.h1Exists())? this._bz.h1() : null;
  }
  return this._end_tangent;
}
ABezier.isHorizontal  = function() { return this._is_horizontal; }
ABezier.isVertical    = function() { return this._is_vertical; }
ABezier.horizontalGuide = function() {
  if(this._horizontal_guide_var === undefined) {
    if(!this._is_horizontal) throw new Error(
      'Cannot produce horizontal guide for a non-horizontal Bezier');
    var y = 0.5*(this._bz.a0().y().get() + this._bz.a1().y().get())
    this._horizontal_guide_var = Scalar.New(y);
  }
  return this._horizontal_guide_var;
}
ABezier.verticalGuide = function() {
  if(this._vertical_guide_var === undefined) {
    if(!this._is_vertical) throw new Error(
      'Cannot produce vertical guide for a non-vertical Bezier');
    var x = 0.5*(this._bz.a0().x().get() + this._bz.a1().x().get())
    this._vertical_guide_var = Scalar.New(x);
  }
  return this._vertical_guide_var;
}

ABezier.analyzeWithPrev = function(prev, globals) {
  var curr = this;

  // get pieces of things
  var anchor  = curr.seg().a0();
  var tan_in  = prev.endTangent();
  var tan_out = curr.beginTangent();

  // maintain geometric continuity
  if(tan_in && tan_out) {
    var colin = Colinear.test(anchor, tan_in, tan_out, SIN_1_DEG);
    if(colin) {
      this._a0_G0_continuous = true;
      if(prev.isBezier()) { // not tuned right for arcs...
        var mid = Vec2.mul(0.5, Vec2.add(tan_in.getxy(), tan_out.getxy()));
        if(EqualPt.test(mid, anchor, globals.EPSILON))
          this._a0_C0_continuous = true;
      }
    }
  }
}
ABezier.buildConstraintsWithPrev = function(prev) {
  if(this._a0_C0_continuous) {
    var anchor  = this.seg().a0();
    var tan_in  = prev.endTangent();
    var tan_out = this.beginTangent();
    var cs = this._constraints;
    cs.push(Average.New([tan_in.x(), tan_out.x()], anchor.x()));
    cs.push(Average.New([tan_in.y(), tan_out.y()], anchor.y()));
  }
  if(this._a0_G0_continuous) {
    var anchor  = this.seg().a0();
    var tan_in  = prev.endTangent();
    var tan_out = this.beginTangent();
    this._constraints.push(Colinear.New(anchor, tan_in, tan_out));
  }
}






AArc.isArc = function() { return true; }
AArc.New = function(arc) {
  var a = Object.create(AArc);
  a._arc = arc;
  a._samples = [];
  a._sample_ts = [];
  a._constraints = [];
  return a;
}
AArc.JSONSnapshot = function(auditor) {
  var arc = auditor.receiveWith(function(arc) {
    throw new Error('should have already snapshotted the arc');
  })(this._arc);
  var samples = this._samples.map(auditor.receiveWith(function(pt) {
    return pt.getxy();
  }));
  var sample_ts = this._sample_ts.slice();
  if(this._circle)
    var circle = auditor.receiveWith(function(circ) {
      return circ.JSONSnapshot(auditor);
    })(this._circle);

  // include some decisions from analysis
  return {
    seg_type:     'arc',
    arc:          arc,
    samples:      samples,
    sample_ts:    sample_ts,
    circle:       circle,
    a0G0_continuous:  this._a0_G0_continuous,
    a0eq_curvature:   this._a0_equal_curvature,
  };
}
AArc.fromJSONSnapshot = function(aarcjson, auditor) {
  var arc = auditor.dispenseWith(function(arcjson) {
    return Arc.fromJSONSnapshot(arcjson, auditor);
  })(aarcjson.arc);
  var samples = aarcjson.samples.map(auditor.dispenseWith(function(pxy) {
    return Vec2.New(pxy);
  }));
  var sample_ts = aarcjson.sample_ts.slice();
  if(aarcjson.circle)
    var circle = auditor.dispenseWith(function(circjson) {
      return Circle.fromJSONSnapshot(circjson, auditor);
    })(aarcjson.circle);

  var aarc = AArc.New(arc);
  aarc._samples = samples;
  aarc._sample_ts = sample_ts;
  aarc._circle = circle;

  // various properties
  aarc._a0_G0_continuous    = aarcjson.a0G0_continuous;
  aarc._a0_equal_curvature  = aarcjson.a0eq_curvature;

  // add constraints for samples
  for(var k=0; k<samples.length; k++)
    aarc._constraints.push(ArcSample.New(arc, samples[k], sample_ts[k]));

  return aarc;
}
AArc.arc = function() { return this._arc; };
AArc.seg = function() { return this._arc; };
AArc.samples = function() {
  return this._samples;
}
AArc.constraints = function() {
  return this._constraints; // UNSAFE: No shallow copy
}
AArc.addSample = function(pt, t) {
  this._samples.push(pt);
  this._sample_ts.push(t);
  this._constraints.push(ArcSample.New(this._arc, pt, t));
}
AArc.analyzeAlone = function(globals) {
  var arc = this._arc;

  // try to fit a circle to this arc, null if radius bigger than 10x drawing
  this._circle = arc.getCircle(globals.diagonal * 10);
}
AArc.buildConstraintsAlone = function() {
  var arc = this._arc;

  // enforce arc-ness
  // the control point must lie on the bisector between the anchors
  this._constraints.push(Bisector.New(arc.p(0), arc.p(2), arc.p(1)));
  // the rational Bezier weight parameter must be exactly as determined
  // for a circular arc
  this._constraints.push(ArcWeight.New(arc));
//  var msg = String(arc.a0().getxy()) + " ; "
//          + String(arc.h().getxy()) + " ; "
//          + String(arc.a1().getxy()) + " ; "
//          + String(arc.w().get());
//  console.log(msg);
}

AArc.beginTangent = function() { return this._arc.h(); }
AArc.endTangent   = function() { return this._arc.h(); }

AArc.circleFit = function(circle) {
  var arc = this.arc();
  var dist = Math.max( OnCircle.distanceToCircle(arc.getMid(), circle),
               Math.max( OnCircle.distanceToCircle(arc.a0(), circle),
                         OnCircle.distanceToCircle(arc.a1(), circle)   ));
  return dist;
}
AArc.circle = function() {
  return this._circle;
}
AArc.constrainToCircle = function(circle) {
  if(circle) this._circle = circle;
  circle = this._circle;
  // note redundant constraints occur here due to shared anchors
  this._constraints.push(OnCircle.New(this._arc.a0(), circle));
  this._constraints.push(OnCircle.New(this._arc.a1(), circle));
  for(var k=0; k<this._samples.length; k++)
    this._constraints.push(OnCircle.New(this._samples[k], circle));
}

AArc.analyzeWithPrev = function(prev, globals) {
  var curr = this;

  // get pieces of things
  var anchor  = curr.seg().a0();
  var tan_in  = prev.endTangent();
  var tan_out = curr.beginTangent();

  // maintain geometric continuity
  if(tan_in && tan_out) {
    var colin = Colinear.test(anchor, tan_in, tan_out, SIN_1_DEG);
    if(colin)
      this._a0_G0_continuous = true;
      //this._constraints.push(Colinear.New(anchor, tan_in, tan_out));
  }

  // constrain successive arcs to lie on a common circle if it makes sense
  // Here, we only set them to have the same circle object, but don't
  // enforce the constraint...
  if(prev.isArc() && curr._circle && prev._circle) {
    // try fitting previous arc onto the current circle
    var prev_dist = prev.circleFit(curr._circle);
    // and vice-versa
    var curr_dist = curr.circleFit(prev._circle);

    // If this arc fits the previous circle, go with that
    if(curr_dist < globals.EPSILON || prev_dist < globals.EPSILON)
      this._a0_equal_curvature = true;
    //  curr._circle = prev._circle;
    //}
    //// otherwise, we might permit modifying the previous arc's circle
    //else if(prev_dist < globals.EPSILON) {
    //  prev._circle = curr._circle;
    //}
  }
}
AArc.buildConstraintsWithPrev = function(prev) {
  // enforce geometric continuity
  if(this._a0_G0_continuous) {
    var anchor  = this.seg().a0();
    var tan_in  = prev.endTangent();
    var tan_out = this.beginTangent();

    this._constraints.push(Colinear.New(anchor, tan_in, tan_out))
  }
}


function newAContourObject(contour) {
  var ac = Object.create(AContour);
  ac._contour = contour;
  ac._constraints = [];
  return ac;
}
AContour.NewWithSubdivision = function(contour, subdivs) {
  var ac = newAContourObject(contour);
  var cs = ac._constraints;
  var ps = []; // polygon points
  var asegs = (ac._asegs = contour.segments().map(ASegment.New));

  // parameter-uniform samples per bezier
  var tvals = [];
  for(var k=0; k<subdivs; k++) {
    tvals.push(k/subdivs);
  }

  // get points and sample constraints
  asegs.forEach(function(aseg) {
    var seg = aseg.seg();

    ps.push(seg.a0());
    for(var k=1; k<subdivs; k++) {
      var t   = tvals[k];
      var xy  = seg.testEval(t);
      var pt  = Vec2.New(xy);

      ps.push(pt);
      aseg.addSample(pt, t);
    }
  });

  ac._polygon = Polyline.New(ps);
  ac._polygon.close();

  return ac;
}
AContour.NewWithDensity = function(contour, density_scale, maxsubdiv) {
  var ac = newAContourObject(contour);
  var cs = ac._constraints;
  var ps = []; // polygon points
  var asegs = (ac._asegs = contour.segments().map(ASegment.New));

  if(maxsubdiv) maxsubdiv = Math.max(maxsubdiv, 3); // must be at least 3
  var epsilon = 0.5*density_scale; // good enough estimate for our purposes
  asegs.forEach(function(aseg) {
    var seg = aseg.seg();

    // Determine how many samples we want (including first anchor, not second)
    var length  = seg.curveLength(epsilon);
    var n_samp = Math.floor(length/density_scale + 0.5);
    // certain curve types need to have a minimum number of sample points
    // to sufficiently express degrees of freedom in control
    n_samp = Math.max(2,n_samp);
    if(aseg.isBezier() && n_samp < 3) n_samp = 3;
    if(maxsubdiv) n_samp = Math.min(n_samp,maxsubdiv);

    ps.push(seg.a0());
    seg.distributeSamplesEvenly(n_samp-1).forEach(function(xyt) {
      var pt = Vec2.New(xyt[1]);
      var t  = xyt[0];
      ps.push(pt);
      aseg.addSample(pt,t);
    });
  });

  ac._polygon = Polyline.New(ps);
  ac._polygon.close();

  return ac;
}
AContour.JSONSnapshot = function(auditor) {
  var contour = auditor.receiveWith(function(c) {
    throw new Error('should have already snapshotted the contour');
  })(this._contour);
  var polygon = auditor.receiveWith(function(pgon) {
    return pgon.JSONSnapshot(auditor);
  })(this._polygon);
  var asegs = this._asegs.map(auditor.receiveWith(function(aseg) {
    return aseg.JSONSnapshot(auditor);
  }));

  var cgs = this._circle_groups.map(function(cgjson) {
    return cgjson.map(auditor.receiveWith(function(aseg) {
      return ASegment.JSONSnapshot(aseg, auditor);
    }));
  });

  return {
    contour:        contour,
    asegs:          asegs,
    polygon:        polygon,
    circle_groups:  cgs,
  };
}
AContour.fromJSONSnapshot = function(acsnap, auditor) {
  var contour = auditor.dispenseWith(function(cjson) {
    return Contour.fromJSONSnapshot(cjson, auditor);
  })(acsnap.contour);
  var polygon = auditor.dispenseWith(function(pgonjson) {
    return Polyline.fromJSONSnapshot(pgonjson, auditor);
  })(acsnap.polygon);
  var asegs = acsnap.asegs.map(auditor.dispenseWith(function(asegjson) {
    return ASegment.fromJSONSnapshot(asegjson, auditor);
  }));

  // Do we need to re-add samples here?

  var cgs = acsnap.circle_groups.map(function(cgjson) {
    return cgjson.map(auditor.dispenseWith(function(asegjson) {
      return ASegment.fromJSONSnapshot(asegjson, auditor);
    }));
  });

  var ac = newAContourObject(contour);
  var cs = ac._constraints;
  ac._polygon       = polygon;
  ac._asegs         = asegs;
  ac._circle_groups = cgs;
  return ac;
}

AContour.contour = function() {
  return this._contour;
}
AContour.last_aseg = function() {
  return this._asegs[this._asegs.length-1];
}
AContour.polygon = function() {
  return this._polygon;
}
AContour.constraints = function() {
  return this._constraints.concat(
    this._asegs.flatmap(function(aseg) {
      return aseg.constraints();
    })
  );
}
AContour.circles = function() {
  if(this._circles === undefined) {
    this._circles = this._circle_groups.map(function(cg) {
      return cg[0].circle();
    });
  }
  return this._circles;
}

AContour.analyze = function(globals) {
  // do individual analyses
  this._asegs.forEach(function(aseg) { aseg.analyzeAlone(globals); });
  var N = this._asegs.length;

  // do pair analyses
  var prev_aseg = this.last_aseg();
  for(var k=0; k<N; k++) {
    var curr_aseg = this._asegs[k];

    curr_aseg.analyzeWithPrev(prev_aseg, globals);

    prev_aseg = curr_aseg;
  }

  // compute the circle groups
  var circle_groups = (this._circle_groups = []);
  var run = [this.last_aseg()]
  for(var k=0; k<N; k++) {
    var curr = this._asegs[k];
    if(curr._a0_equal_curvature) {
      run.push(curr);
    } else {
      if(run.length > 1) {
        circle_groups.push(run);
      }
      run = [curr];
    }
    prev = curr;
  }
  if(run.length > 1) { // handle the last run
    // does this run wrap around?
    if(this._asegs[0]._a0_equal_curvature) {
      // if there's only one global run
      if(circle_groups.length === 0)
        circle_groups.push(this._asegs);
      // otherwise, concatenate onto the first run, but
      // make sure to slice out the duplicate last segment
      else
        circle_groups[0] = run.concat(circle_groups[0].slice(1));
    }
    // if the run doesn't wrap around, then just add it
    else
      circle_groups.push(run);
  }
  // force computation of circles to propagate down to segments
  for(var cg_i = 0; cg_i < circle_groups.length; cg_i++) {
    var cg = circle_groups[cg_i];
    // find the best fit circle for each group
    // First, get the set of all points to fit to
    var a0 = cg[0].seg().a0().getxy();
    var points = [a0];
    cg.forEach(function(aarc) {
      var samps = aarc.samples();
      for(var k=0; k<samps.length; k++)
        points.push(samps[k].getxy());
      points.push(aarc.seg().a1().getxy());
    });

    // then fit the circle
    var res = fit_circle(points);
    // if the error is bad, then kill this group
    if(res.error > globals.EPSILON) {
      circle_groups.splice(cg_i, 1);
      cg_i--;
    } else {
      var circle = Circle.New(Vec2.New([res.cx, res.cy]), Scalar.New(res.r));
      cg.forEach(function(aarc) {
        aarc._circle = circle;
      });
    }
  }

//  // now, look for any arcs that share a circle with their neighbors
//  // In those cases, enforce common circle constraints
//  for(var k=0; k<N; k++) {
//    var prev_aseg = this._asegs[(N+k-1)%N];
//    var curr_aseg = this._asegs[k];
//    var next_aseg = this._asegs[(k+1)%N];
//
//    if(curr_aseg.isArc() && curr_aseg.circle()) {
//      var circle = curr_aseg.circle();
//      if( (prev_aseg.isArc() && prev_aseg.circle() === circle) ||
//          (next_aseg.isArc() && next_aseg.circle() === circle) )
//      {
//        curr_aseg.constrainToCircle();
//      }
//      else curr_aseg._circle = null; // REMOVE THIS LATER; FOR DEMO NOW
//    }
//  }
}
AContour.buildConstraints = function() {
  this._asegs.forEach(function(aseg) { aseg.buildConstraintsAlone(); });

  var prev = this.last_aseg();
  for(var k=0; k<this._asegs.length; k++) {
    this._asegs[k].buildConstraintsWithPrev(prev);
    prev = this._asegs[k];
  }

  // circles
  var NCG = this._circle_groups.length;
  var circles = this.circles();
  for(var i = 0; i<NCG; i++) {
    var cg = this._circle_groups[i];
    var circle = circles[i];
    // run through and constrain
    for(var k=0; k<cg.length; k++) {
      cg[k].constrainToCircle(circle);
    }
  }
}
// requires that samples have been tagged with
// samp._analysis_sample_split_me = true
AContour.splitAtSamples = function() {
  var runs = [];
  var curr_run = [];

  // go through and accumulate segments into the current run
  // when a run is complete, we add it (as a contour) to the runs list
  for(var k=0; k<this._asegs.length; k++) {
    var split_segs = this._asegs[k].splitAtSamples();
    if(split_segs.length === 1)
      curr_run.push(split_segs[0]);
    else {
      // end the current run with the first seg
      curr_run.push(split_segs[0]);
      runs.push(Contour.NewOpen(curr_run));
      // all middle segs are unitary runs, so handle those
      for(var j=1; j<split_segs.length-1; j++)
        runs.push(Contour.NewOpen([split_segs[j]]));
      // the final seg starts the next run
      curr_run = [split_segs[split_segs.length-1]];
    }
    // If the anchor at the end of this original segment is a split point,
    // then end the run and start a new run immediately
    if(this._asegs[k].seg().a1()._analysis_sample_split_me) {
      runs.push(Contour.NewOpen(curr_run));
      curr_run = [];
    }
  }

  // handle the last run.  If it exists, it needs to be joined to the start
  if(curr_run.length > 0) {
    // if no runs have been queued up, then there were no splits
    if(runs.length === 0) return [this.contour()];
    // otherwise...
    runs[0] = Contour.NewOpen(curr_run).join(runs[0]);
  }

  return runs;
}

AContour.getHorizontalSegs = function() {
  return this._asegs.flatmap(function(as) {
    if(as.isBezier() && as.isHorizontal()) return [as]; else return [];
  });
}
AContour.getVerticalSegs = function() {
  return this._asegs.flatmap(function(as) {
    if(as.isBezier() && as.isVertical()) return [as]; else return [];
  })
}





function newAnalysisObject(pmap) {
  var A = Object.create(Analysis);
  A._pmap = pmap;
  A._constraints = [];
  return A;
}
Analysis.NewParamSubdivision = function(pmap, subdivs) {
  if(typeof(subdivs) !== 'number' || subdivs < 1) {
    throw new TypeError('2nd argument to NewParamSubdivision() '+
      'should be a positive integer');
  }
  // subdivs==1 is equivalent to polygonFromAnchors

  var A = newAnalysisObject(pmap);
  A._acontours = pmap.mapContours(function(contour) {
    var ac = AContour.NewWithSubdivision(contour, subdivs);
    return ac;
  });
  return A;
}
Analysis.NewFromDensity = function(pmap, resolution, maxsubdiv) {
  if(typeof(resolution) !== 'number') {
    throw new TypeError('2nd argument to NewFromDensity() '+
      'should be a number');
  }
  if(typeof(maxsubdiv) !== 'number') maxsubdiv = undefined;

  var A = newAnalysisObject(pmap);
  var globals = A.globals();
  var density_scale = Math.max(globals.width, globals.height) / resolution;

  A._acontours = pmap.mapContours(function(contour) {
    var ac = AContour.NewWithDensity(contour, density_scale, maxsubdiv);
    return ac;
  });
  return A;
}
Analysis.JSONSnapshot = function(auditor) {
  var pmap = auditor.receiveWith(function(pmap) {
    throw new Error('should have already snapshotted the planar map');
  })(this._pmap);
  var acs = this._acontours.map(auditor.receiveWith(function(ac) {
    return ac.JSONSnapshot(auditor);
  }));
  var hgs = this._horizontal_groups.map(function(hg) {
    return hg.map(auditor.receiveWith(function(aseg) {
      return aseg.JSONSnapshot(auditor);
    }));
  });
  var vgs = this._vertical_groups.map(function(vg) {
    return vg.map(auditor.receiveWith(function(aseg) {
      return aseg.JSONSnapshot(auditor);
    }));
  });
  return {
    pmap:       pmap,
    acontours:  acs,
    horizontal_groups: hgs,
    vertical_groups: vgs,
  };
}
Analysis.fromJSONSnapshot = function(asnap, auditor) {
  var pmap = auditor.dispenseWith(function(pmapjson) {
    return PlanarMap.fromJSONSnapshot(pmapjson, auditor);
  })(asnap.pmap);
  var acs = asnap.acontours.map(auditor.dispenseWith(function(acjson) {
    return AContour.fromJSONSnapshot(acjson, auditor);
  }));
  var hgs = asnap.horizontal_groups.map(function(hgjson) {
    return hgjson.map(auditor.dispenseWith(function(asegjson) {
      return ASegment.fromJSONSnapshot(asegjson, auditor);
    }));
  });
  var vgs = asnap.vertical_groups.map(function(vgjson) {
    return vgjson.map(auditor.dispenseWith(function(asegjson) {
      return ASegment.fromJSONSnapshot(asegjson, auditor);
    }))
  });
  var A = newAnalysisObject(pmap);
  A._acontours = acs;
  A._horizontal_groups = hgs;
  A._vertical_groups = vgs;
  return A;
}
Analysis.polygons = function() {
  return this._acontours.map(function(ac) {
    return ac.polygon();
  });
}
Analysis.polygonPoints = function() {
  return this._acontours.mapUnion(function(ac) {
    var pgon = ac.polygon();
    return new Set(pgon.points());
  })
}
Analysis.constraints = function() {
  //throw new Error('fah');
  //console.log(this);
  return this._constraints.concat(this._acontours.flatmap(function(ac) {
    return ac.constraints();
  }));
}
Analysis.circles = function() {
  return this._acontours.flatmap(function(ac) {
    return ac.circles();
  });
}
Analysis.globals = function() {
  var bounds = this._pmap.getBounds();
  var mindim = Math.min(bounds.w, bounds.h);
  if(mindim < 1e-10) mindim = 1e-10; // safety in extreme case
  var EPSILON = mindim * 5e-4;
  var globals = {
    EPSILON: EPSILON,
    width: bounds.w,
    height: bounds.h,
    diagonal: Vec2.len(bounds),
  };
  return globals;
}

Analysis.analyze = function() {
  // compute global values for the analysis
  var globals = this.globals();

  // just per-curve analysis for now
  this._acontours.forEach(function(ac) {
    ac.analyze(globals);
  });

  // gather horizontal segments and vertical segments
  // and align them
  var horizontals = [];
  var verticals = [];
  this._acontours.forEach(function(ac) {
    horizontals = horizontals.concat(ac.getHorizontalSegs());
    verticals   = verticals.concat(ac.getVerticalSegs());
  });
  // sort by guide val
  horizontals = horizontals.map(function(bz) {
    var guide = bz.horizontalGuide();
    return [guide.get(), guide, bz];
  });
  verticals = verticals.map(function(bz) {
    var guide = bz.verticalGuide();
    return [guide.get(), guide, bz];
  });
  horizontals.sort(function(a,b) { return a[0] - b[0]; });
  verticals.sort(function(a,b) { return a[0] - b[0]; });

  // Now, run through and group the segments
  this._horizontal_groups = [];
  this._vertical_groups = [];
  function coallesce_segs(dstarr, srcarr) {
    if(srcarr.length === 0) return;

    var run = [srcarr[0][2]];
    for(var k=1; k<srcarr.length; k++) {
      var prev = srcarr[k-1];
      var curr = srcarr[k];
      if(curr[0]-prev[0] < globals.EPSILON) {
        run.push(curr[2]);
      } else {
        if(run.length > 1) {
          dstarr.push(run);
        }
        run = [curr[2]];
      }
    }
    if(run.length > 1) { // last run?
      dstarr.push(run);
    }
  }
  coallesce_segs(this._horizontal_groups, horizontals);
  coallesce_segs(this._vertical_groups, verticals);


  // TODELETE
  // Now we can run through and snap guidelines together...
//  for(var k=1; k<horizontals.length; k++) {
//    var curr = horizontals[k];
//    var prev = horizontals[k-1];
//    if(curr[0]-prev[0] < globals.EPSILON)
//      this._constraints.push(EqualNum.New(curr[1], prev[1]));
//  }
//  for(var k=1; k<verticals.length; k++) {
//    var curr = verticals[k];
//    var prev = verticals[k-1];
//    if(curr[0]-prev[0] < globals.EPSILON)
//      this._constraints.push(EqualNum.New(curr[1], prev[1]));
//  }
}
Analysis.buildConstraints = function() {
  var self = this;
  self._acontours.forEach(function(ac) {
    ac.buildConstraints();
  });

  // horizontal and vertical segment groups...
  self._horizontal_groups.forEach(function(hg) {
    for(var k=1; k<hg.length; k++) {
      self._constraints.push(EqualNum.New(hg[k-1].horizontalGuide(),
                                          hg[k].horizontalGuide()));
    }
  });
  self._vertical_groups.forEach(function(vg) {
    for(var k=1; k<vg.length; k++) {
      self._constraints.push(EqualNum.New(vg[k-1].verticalGuide(),
                                          vg[k].verticalGuide()));
    }
  });
}
// requires that samples have been tagged with
// samp._analysis_sample_split_me = true
Analysis.splitAtSamples = function(samps) {
  samps.forEach(function(s) { s._analysis_sample_split_me = true; });

  var contours = [];
  // rejoin the split contours for now
  this._acontours.forEach(function(ac) {
    var splits = ac.splitAtSamples();
    var together = splits[0];
    for(var k=1;k<splits.length;k++)
      together = together.join(splits[k]);
    together.close();
    contours.push(together);
  });

  samps.forEach(function(s) { delete s._analysis_sample_split_me; });

  return PlanarMap.New(contours);
}
Analysis.spliceLoop = function(loop_gaps) {
  // mark the points at which we should split
  loop_gaps.forEach(function(gap) {
    gap[0]._analysis_sample_split_me = true;
    gap[1]._analysis_sample_split_me = true;
  });

  // Actually split the contour and setup the default pointer structure
  var final_cs = [];
  var split_cs = [];
  this._acontours.forEach(function(ac) {
    var splits = ac.splitAtSamples();
    console.log('SPLIT', ac.contour(), splits);
    if(splits.length === 1) {
      if(!splits[0].isClosed()) throw new Error("UNHANDLED; FIX LATER?");
      final_cs.push(splits[0]);
    }
    else {
      // annotate the sequence at the splice points
      var prev = splits[splits.length-1];
      for(var k=0; k<splits.length; k++) {
        var curr = splits[k];
        var pt = curr.firstSeg().a0();
        if(!pt._analysis_sample_split_me)
          throw new Error("Cannot Happen: all split points should be tagged");
        pt._analysis_prev_contour = prev;
        pt._analysis_next_contour = curr;
        prev = curr;
      }
      split_cs.push(splits);
    }
  });

  // splice the new gap contours into the temporary pointer structure
  var gap_contours = [];
  for(var k=0; k<loop_gaps.length; k++) {
    var gap = loop_gaps[k];
    var p0 = gap[0]; var p1 = gap[1];
    var c = Contour.NewOpen([ Bezier.New(p0, Vec2.New(p0.getxy()), 
                                         Vec2.New(p1.getxy()), p1) ]);
    gap_contours[k] = c;
    p0._analysis_next_contour = c;
    p1._analysis_prev_contour = c;
    c._gap_c_debug = k;
  }

  // and then we can go ahead and just trace along the pointers to
  // extract the new contours
  for(var k=0; k<loop_gaps.length; k++) {
    var start_point = loop_gaps[k][0];
    if(start_point._analysis_contour_extracted) continue;

    var start = start_point._analysis_prev_contour;
    start.firstSeg().a0()._analysis_contour_extracted = true;
    var curr = start.lastSeg().a1()._analysis_next_contour;

    var full = start;
    // until we start repeating...
    while(!curr.firstSeg().a0()._analysis_contour_extracted) {
      curr.firstSeg().a0()._analysis_contour_extracted = true; // visited
      full = full.join(curr);
      curr = curr.lastSeg().a1()._analysis_next_contour; // next contour
    }
    full.close();
    final_cs.push(full);
  }
  console.log(final_cs);

  // cleanup
  loop_gaps.forEach(function(gap) {
    delete gap[0]._analysis_sample_split_me;
    delete gap[1]._analysis_sample_split_me;
    delete gap[0]._analysis_prev_contour;
    delete gap[1]._analysis_prev_contour;
    delete gap[0]._analysis_next_contour;
    delete gap[1]._analysis_next_contour;
    delete gap[0]._analysis_contour_extracted;
    delete gap[1]._analysis_contour_extracted;
  });

  return PlanarMap.New(final_cs);
}
/*
Analysis.removeContour = function(plproxy) {
  // First find which contour it is
  for(var k=0; k<this._acontours.length; k++) {
    var c = this._acontours[k].contour();
    c.firstSeg().a0()._remove_contour_marker = c;
  }
  var the_contour = null;
  plproxy.points().forEach(function(pt) {
    if(pt._remove_contour_marker)
      the_contour = pt._remove_contour_marker;
  });
  if(!the_contour) throw new Error('couldn\'t find the contour');
  for(var k=0; k<this._acontours.length; k++) {
    delete this._acontours[k].contour()
               .firstSeg().a0()._remove_contour_marker;
  }

  // now, remove the contour and give us a new planar map
  var contours = this._acontours
                    .map(function(ac) { return ac.contour(); })
                    .filter(function(c) { return c !== the_contour; });

  return PlanarMap.New(contours);
}
*/






})(typeof window === 'undefined');
