/*  
 *  selectiongeometry.js
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
var exports = on_node? module.exports : window['selectiongeometry']={};



// modules
if(on_node) {
  var primitives  = require('./primitives');
  var isct        = require('./isct');
  var contours    = require('./contours');
  var constraints = require('./constraints');
  var numeric_subroutines = require('./numeric_subroutines');
  //var emtriangle  = require()
} else {
  var primitives  = window.primitives;
  var isct        = window.isct;
  var contours    = window.contours;
  var constraints = window.constraints;
  var numeric_subroutines = window.numeric_subroutines;
  var emtriangle  = window.emtriangle;
  if(!primitives || !isct || !contours || !constraints || !numeric_subroutines)
    throw new Error(
      "Must have Primitives, Isct, Contours, Constraints, & "+
      "Numeric Subroutines Modules loaded before Selection Geometry");
}


// IMPORTS
var Scalar              = primitives.Scalar;
var Vec2                = primitives.Vec2;
var Box2                = primitives.Box2;

var AABVH               = isct.AABVH;

var Polyline            = contours.Polyline;

var AvgRadius           = constraints.AvgRadius;


// DECLARATIONS
var SelectionGeometry   = (exports.SelectionGeometry = {});

// indirection wrapper around points
var GeomPoint           = {}; // NO EXPORT
var GeomPolyline        = {}; // NO EXPORT


// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  GEOM POINT / POLYLINE

GeomPoint.New = function(orig) {
  var p       = Object.create(GeomPoint);
  p.orig      = orig;
  p.xy        = orig.getxy();
  return p;
}

GeomPolyline.New = function(ps, closed) {
  var gpline          = Object.create(GeomPolyline);
  gpline.ps           = ps.slice();
  gpline._is_closed   = !!closed;
  return gpline;
}
GeomPolyline.NewClosed  = function(ps) { return GeomPolyline.New(ps, true); }
GeomPolyline.isClosed   = function() { return this._is_closed; }
GeomPolyline.close      = function() { this._is_closed = true; }
GeomPolyline.firstpt    = function() { return this.ps[0]; }
GeomPolyline.lastpt     = function() { return this.ps[this.ps.length-1]; }
GeomPolyline.polyline   = function() {
  var pline = Polyline.New(this.ps.map(function(p) { return p.orig; }));
  if(this.isClosed()) pline.close();
  return pline;
}


// general selection strategy
//    1) points -> selected vs. unselected polygonal segments
//    2) loop closure
//    3) validate loops
//      * intersections w/ polygons?
//      * containment of unselected polygons
//      * has isolated points?
//    4) want to be able to triangulate loops
// 

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  GEOMETRY CONSTRUCTION

// record the points and backing polygons;
// organize the points into contiguous runs


SelectionGeometry.New = function(points, polygons) {
  var sg = Object.create(SelectionGeometry);

  // reflect polygons and points
  var listlistpoints = [];
  this._polygons = polygons.flatmap(function(pgon) {
    var ps = pgon.points().map(function(pt) {
      var gp = GeomPoint.New(pt);
      pt._geom_point = gp;
      return gp;
    });
    listlistpoints.push(ps);
    return GeomPolyline.NewClosed(ps);
  });
  this._all_ps = listlistpoints.flatten();

  // select points
  points.forEach(function(pt) {
    pt._geom_point.is_selected = true;
  });
  this._select_ps =
    this._all_ps.filter(function(p){ return p.is_selected; });
  this._unselect_ps =
    this._all_ps.filter(function(p){ return !p.is_selected; });

  // cleanup
  points.forEach(function(pt) { delete pt._geom_point; });

  // compute useful things
  sg.computePointBounds();
  sg.buildPolygonGraph_and_RunGraph();
  sg.extractRuns();

  return sg;
}

SelectionGeometry.buildPolygonGraph_and_RunGraph = function() {
  this._polygons.forEach(function(pgon) {
    prev_pt = pgon.lastpt();
    for(var k=0; k<pgon.ps.length; k++) {
      var curr_pt = pgon.ps[k];
      prev_pt.pgon_next = curr_pt;
      curr_pt.pgon_prev = prev_pt;
      if(curr_pt.is_selected == prev_pt.is_selected) {
        prev_pt.run_next = curr_pt;
        curr_pt.run_prev = prev_pt;
      }
      prev_pt = curr_pt;
    }
  });
}

SelectionGeometry.extractRuns = function() {
  var sg = this;
  sg._select_runs = [];
  sg._unselect_runs = [];

  // extract runs
  sg._polygons.forEach(function(pgon) {
    var found_any_runs = false;
    for(var k=0; k<pgon.ps.length; k++) {
      var basept = pgon.ps[k];
      if(!basept.run_prev) { // start of run!
        found_any_runs = true;

        // extract the run
        var runps = [];
        var pt = basept;
        while(pt) {
          runps.push(pt);
          pt = pt.run_next;
        }
        var run = GeomPolyline.New(runps);
        if(basept.is_selected)  sg._select_runs.push(run);
        else                    sg._unselect_runs.push(run);
      }
    }
    if(!found_any_runs) { // add whole polygon as a run
      if(pgon.firstpt().is_selected)  sg._select_runs.push(pgon);
      else                            sg._unselect_runs.push(pgon);
    }
  });
}

SelectionGeometry.computePointBounds = function() {
  var res = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
  this._all_ps.forEach(function(pt) {
    res.l = Math.min(pt.xy[0], res.l);
    res.r = Math.max(pt.xy[0], res.r);
    res.t = Math.min(pt.xy[1], res.t);
    res.b = Math.max(pt.xy[1], res.b);
  });
  res.w = res.r - res.l;
  res.h = res.b - res.t;
  this._bounds = res;
}


// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  LOOP CLOSURE

function loop_close_polylines(polylines) {
  // pull out any incoming loops
  var input_loops = polylines.filter(function(pl) { return pl.isClosed(); })
                             .map(function(pl) { return [pl]; });
  polylines       = polylines.filter(function(pl) { return !pl.isClosed(); });
  //console.log('loop close input', input_loops, polylines);
  if(polylines.length > 100) {
    // REJECT
    throw new Error('CANNOT QUICKLY HANDLE MORE THAN 100 POLYLINES '+
      'in Agglomerative Clustering algorithm');
  }

  if(polylines.length < 1) return input_loops;

  // strategy:
  //  (1) turn each input polyline into a "loop" by connecting its start
  //      and end points
  //  (2) greedily merge the loops to arrive at one aggregate loop

  var Loop = {};
  var loops = polylines.map(function(pl) {
    var loop = Object.create(Loop);
    loop.pls = [pl];
    return loop;
  });
  Loop.best_splice_with = function(rhs) {
    var best_cost = Infinity;
    var best_i = 0;
    var best_j = 0;

    var iout = this.pls[this.pls.length-1].lastpt().xy;
    for(var i=0; i<this.pls.length; i++) {
      var iin = this.pls[i].firstpt().xy;

      var jout = rhs.pls[rhs.pls.length-1].lastpt().xy;
      for(var j=0; j<rhs.pls.length; j++) {
        var jin = rhs.pls[j].firstpt().xy;

        var ii = Vec2.len(Vec2.sub(iin,iout));
        var ij = Vec2.len(Vec2.sub(jin,iout));
        var ji = Vec2.len(Vec2.sub(iin,jout));
        var jj = Vec2.len(Vec2.sub(jin,jout));
        var cost = ij + ji - ii - jj;
        if(cost < best_cost) {
          best_cost = cost;
          best_i = i;
          best_j = j;
        }

        jout = rhs.pls[j].lastpt().xy;
      }

      iout = this.pls[i].lastpt().xy;
    }

    return {
      cost:       best_cost,
      lhs:        this,
      rhs:        rhs,
      left_cut:   best_i,
      right_cut:  best_j,
    };
  }
  Loop.do_splice = function(data) {
    var i = data.left_cut;
    var j = data.right_cut;
    var lhs = data.lhs;
    var rhs = data.rhs;

    var left_begin  = lhs.pls.slice(0,i);
    var left_end    = lhs.pls.slice(i);
    var right_begin = rhs.pls.slice(0,j);
    var right_end   = rhs.pls.slice(j);

    var loop = Object.create(Loop);
    loop.pls = left_begin.concat(right_end, right_begin, left_end);
    return loop;
  }

  function closest_loops() {
    var best_splice = { cost: Infinity };
    for(var i=0; i<loops.length; i++) {
      for(var j=0; j<i; j++) {
        var splice = loops[i].best_splice_with(loops[j]);
        if(splice.cost < best_splice.cost) {
          best_splice = splice;
          best_splice.i = i;
          best_splice.j = j;
        }
      }
    }
    return best_splice;
  }

  while(loops.length > 1) {
    var best_splice = closest_loops();
    var new_loop = Loop.do_splice(best_splice);
    // remove the old loops
    loops.splice(best_splice.i, 1); // remove i
    loops[best_splice.j] = new_loop;
  }

  return input_loops.concat([loops[0].pls]);
}


// does one version of loop closure, based on above function
SelectionGeometry.doLoopClosure = function() {
  this._loops = loop_close_polylines(this._select_runs);
  // set up loop pointers too
  this._loops.forEach(function(loop) {
    var prevpt = loop[loop.length-1].lastpt();
    loop.forEach(function(run) {
      for(var k=0; k<run.ps.length; k++) {
        var currpt = run.ps[k];
        prevpt.loop_next = currpt;
        currpt.loop_prev = prevpt;
        prevpt = currpt;
      }
    })
  });
}


// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  LOOP PROPERTIES


// maintain interop during re-factoring; should die off eventually
SelectionGeometry.legacyLoops = function() {
  var loops = this._loops.map(function(loop) {
    var runs = loop.map(function(run) {
      return run.polyline();
    });
    return runs;
  });
  return loops;
}

SelectionGeometry.pointLoops = function() {
  var loops = this._loops.map(function(loop) {
    var pgon = loop[0].polyline();
    for(var k=1; k<loop.length; k++)
      pgon = pgon.join(loop[k].polyline());
    pgon.close();
    return pgon;
  });
  return loops;
}

SelectionGeometry._INTERNAL_LoopPoints = function() {
  if(this._loop_points) return this._loop_points;

  this._loop_points = this._loops.map(function(loop) {
    return loop.flatmap(function(run) {
      return run.ps;
    });
  });
  return this._loop_points;
}

SelectionGeometry.hasOneLoop = function() {
  return this._loops.length === 1;
}
SelectionGeometry.hasTwoLoops = function() {
  return this._loops.length === 2;
}

SelectionGeometry.hasIsolatedLoopPoints = function() {
  for(var k=0; k<this._loops.length; k++) {
    for(var j=0; j<this._loops[k].length; j++) {
      var run = this._loops[k][j];
      if(run.ps.length == 1) return true;
    }
  }
  return false;
}

SelectionGeometry._INTERNAL_LoopsEdgeTree = function() {
  if(this._cached_segtree) return this._cached_segtree;

  var loops = this._INTERNAL_LoopPoints();
  var segs  = [];
  loops.forEach(function(looppts) {
    var lastpt = looppts[looppts.length-1];
    for(var k=0; k<looppts.length; k++) {
      var pt = looppts[k];
      segs.push([lastpt,pt]);
      lastpt = pt;
    }
  });

  var pretree = performance.now();
  var segtree = AABVH.New(segs, {
    leaf_cutoff: 8, // 8 objects per leaf
    bbox: function(seg) {
      var p0 = seg[0].xy; var p1 = seg[1].xy;
      return Box2.from2Vecs(p0, p1);
    },
    center: function(seg) {
      var p0 = seg[0].xy; var p1 = seg[1].xy;
      return Vec2.mul(0.5, Vec2.add(p0, p1));
    },
  });
  var posttree = performance.now();
  console.log('treebuild in ms', posttree - pretree);

  this._cached_segtree = segtree;
  return segtree;
}

function do_segs_isct(sega, segb, EPSILON) {
  // check for repeated points
  if(segb[0] === sega[0] ||
     segb[1] === sega[0] ||
     segb[0] === sega[1] ||
     segb[1] === sega[1]
  ) {
    return false; // can't intersect if sharing a vertex
  }

  var EPS2 = EPSILON*EPSILON;

  var pa0   = sega[0].xy;
  var pa1   = sega[1].xy;
  var basea = Vec2.sub(pa1,pa0);
  var pb0   = segb[0].xy;
  var pb1   = segb[1].xy;
  var baseb = Vec2.sub(pb1,pb0);
  // check whether a crosses b and vice versa
  var signba0 = Vec2.cross(baseb, Vec2.sub(pa0,pb0));
  var signba1 = Vec2.cross(baseb, Vec2.sub(pa1,pb0));
  var signab0 = Vec2.cross(basea, Vec2.sub(pb0,pa0));
  var signab1 = Vec2.cross(basea, Vec2.sub(pb1,pa0));
  //console.log(pa0,pa1,pb0,pb1,signba0,signba1,signab0,signab1,EPS2);
  var acrossesb = (signba0 <= EPS2 && signba1 >= -EPS2) || 
                  (signba0 >= -EPS2 && signba1 <= EPS2) ;
  var bcrossesa = (signab0 <= EPS2 && signab1 >= -EPS2) || 
                  (signab0 >= -EPS2 && signab1 <= EPS2) ;
  // note: it's possible for a to "cross" b and vice-versa without
  //       the two segments intersecting...
  //       If the two segments are very nearly co-linear,
  //       but well-separated, then this can happen.  However,
  //       if we've already filtered using the bounding boxes of
  //       the line segments, that edge case can't occur here.
  var are_isct = acrossesb && bcrossesa;
  return are_isct;
}

var SIN_1_DEG = Math.sin(Math.PI / 180.0);
SelectionGeometry.loopsAreSelfIntersecting = function() {
  var EPSILON     = Math.max(this._bounds.w,this._bounds.h) * 1e-4;
  var segtree = this._INTERNAL_LoopsEdgeTree();

  var time0 = performance.now();
  var found_isct = false;
  var loops = this._INTERNAL_LoopPoints();
  console.log('loops',loops);
  for(var li=0; li<loops.length; li++) {
    var pts = loops[li];
    if(pts.length <=2) { found_isct = true; break; }

    var prevpt = pts[pts.length-2];
    var currpt = pts[pts.length-1];
    for(var k=0; k<pts.length; k++) {
      var nextpt = pts[k];
      var seg = [prevpt,currpt];
      var segbox = Box2.from2Vecs(prevpt.xy, currpt.xy);

      // first, test whether the loop folds back on itself at currpt
      var eprev   = Vec2.sub(prevpt.xy, currpt.xy);
      var enext   = Vec2.sub(nextpt.xy, currpt.xy);
      var ee      = Vec2.len(eprev) * Vec2.len(enext);
      //var maxlen2 = Math.max(Vec2.len2(eprev), Vec2.len2(enext));
      var area    = Vec2.cross(eprev, enext);
      var proj    = Vec2.dot(eprev, enext);
      if(Math.abs(area) < SIN_1_DEG * ee && proj > 0) {
        //console.log('backfold', eprev, enext, maxlen2, area, proj);
        found_isct = true; break;
      }

      // then test whether the current segment is intersecting
      // any other segment using the tree
      segtree.doIsct(segbox, function(edge) {
        if(do_segs_isct(seg, edge, EPSILON)) { found_isct = true; }
      }, EPSILON);
      if(found_isct) break;

      // finally, advance all the points
      prevpt = currpt;
      currpt = nextpt;
    }
    if(found_isct) break;
  }
  var time1 = performance.now();
  console.log('selfisctloop in ms', time1 - time0);

  return found_isct;
}

SelectionGeometry.loopsAreIntersectingPolygons = function() {
  var EPSILON     = Math.max(this._bounds.w,this._bounds.h) * 1e-4;
  var found_isct  = false;

  var time0 = performance.now();
  for(var loop_i = 0; loop_i < this._loops.length; loop_i++) {
    var loop = this._loops[loop_i];
    if(loop.length === 1 && loop[0].isClosed()) continue; // no gaps to check

    // Explicitly represent the gaps: non-polygon segments of the loop
    var gaps = [];
    var lastpt = loop[loop.length-1].lastpt();
    for(var k=0; k<loop.length; k++) {
      var pt = loop[k].firstpt();
      gaps[k] = [lastpt, pt];
      lastpt = loop[k].lastpt();
    }

    // check whether we're in two special 2-point or 3-point degenerate cases
    if(loop.length === 1 && loop[0].ps.length <= 2) {
      found_isct = true; break;
    }
    if(loop.length === 1 && loop[0].ps.length === 3) {
      var pts = loop[0].ps;

      // colinear test
      var e01 = Vec2.sub(pts[1].xy, pts[0].xy);
      var e02 = Vec2.sub(pts[2].xy, pts[0].xy);
      var e12 = Vec2.sub(pts[2].xy, pts[1].xy);
      var max_len2 = Math.max(Vec2.len2(e12),
                        Math.max(Vec2.len2(e01), Vec2.len2(e02)));
      var max_len2
      var area = Vec2.cross(e01,e02);
      if(Math.abs(area) < EPSILON * max_len2) {
        found_isct = true; break;
      }
    }

    // now check (gap, polygon_edge) intersection
    for(var g=0; g<gaps.length; g++) {
      var gap = gaps[g];
      var gbox = Box2.from2Vecs(gap[0].xy, gap[1].xy);
      for(var pi = 0; pi<this._polygons.length; pi++) {
        var pgon = this._polygons[pi];

        var prevpt = pgon.lastpt();
        for(var k=0; k<pgon.ps.length; k++) {
          var currpt = pgon.ps[k];
          var edge = [prevpt,currpt];
          var ebox = Box2.from2Vecs(prevpt.xy, currpt.xy);
          //if(Box2.isIsct(gbox, ebox, -EPSILON))
          //  console.log(gap, edge,
          //              Box2.isIsct(gbox, ebox, -EPSILON),
          //              do_segs_isct(gap, edge, EPSILON));
          if( Box2.isIsct(gbox, ebox, -EPSILON) &&
              do_segs_isct(gap, edge, EPSILON) )
            found_isct = true;
          prevpt = currpt;
          if(found_isct) break;
        }
        if(found_isct) break;
      }
      if(found_isct) break;
    }
    if(found_isct) break;
  }
  var time1 = performance.now();
  console.log('gapisctloop in ms', time1 - time0);

  return found_isct;
}


// ---------------------------------------------------------------------------


SelectionGeometry._INTERNAL_loopsContainPolygons = function() {
  var EPSILON = Math.max(this._bounds.w,this._bounds.h) * 1e-4;
  var machine_epsilon = 5e-324;

  // Strategy:
  //  Compute a containment test for a single point on each 
  //  unselected run.
  //  *  Each of these chains must lie either entirely inside or outside
  //     the loop, since we've already certified that the loop doesn't
  //     cut any of the polygons.

  //if(!this.hasOneLoop()) return true;

  // Classify each polyline
  var looptree = this._INTERNAL_LoopsEdgeTree();

  // two tests for each polyline:
  //    (i) Is the point we want to classify nearly on the loop?
  //        (this unfortunately can occur in a weird case, so handle it)
  //   (ii) Does a line segment starting at the point we want to classify
  //        and ending outside the bounds of the drawing cross the loop
  //        an even number of times?  (may require some careful epsilon tricks)
  var time0 = performance.now();
  var contain_test = false;
  for(var ri=0; ri<this._unselect_runs.length; ri++) {
    var pt = this._unselect_runs[ri].firstpt();
    var pxy = pt.xy;

    // (i) test if nearly incident to loop
    var ptbox = Box2.fromVec(pxy);
    looptree.doIsct(ptbox, function(edge) {
      var e0 = edge[0].xy;
      var e1 = edge[1].xy;
      var elen = Vec2.len(Vec2.sub(e1,e0));
      var det = Vec2.cross(Vec2.sub(e0,pxy), Vec2.sub(e1,pxy));
      if(Math.abs(det) < EPSILON*elen) { // within epsilon of the edge's line
        // because the point lies within epsilon of the edge's bounding box,
        // we now know the point lies within epsilon of the edge, not just
        // its extension.
        contain_test = true;
      }
    }, EPSILON);
    if(contain_test) break;

    // (ii) test if within loop
    // draw a line segment going all the way right to just outside the bounds
    var endpt = [this._bounds.r + 100*EPSILON, pxy[1]];
    var testbox = [pxy,endpt]; // infinitely thin, but ok
    var n_crossings = 0;
    looptree.doIsct(testbox, function(edge) {
      // Consider the problem that some edge endpoints may end up lying
      // exactly on the classification line.  We can resolve these
      // cases by conceptually perturbing all edge points downward by
      // an amount smaller than machine epsilon.
      // 
      // cases:
      // A) The edge lies entirely to the right of the endpoint
      //   1) Using the above statement about perturbation, we can now
      //      test whether the two endpoints are on different sides
      //      (above/below) the classification line.  If they're on different
      //      sides, then the edge must cross the classification line somewhere
      // B) The edge's bounding box contains the classification point
      var e0 = edge[0].xy;
      var e1 = edge[1].xy;
      var contains_classification = e0[0] <= pxy[0] && e1[0] <= pxy[0];
      if(!contains_classification) {
        var above0 = e0[1] < pxy[1];
        var above1 = e1[1] < pxy[1];
        if(above0 !== above1) n_crossings++;
      }
      else {
        // re-order the points so that the edge is oriented downwards
        // for testing
        if(e0[1] > e1[1]) { var tmp=e0; e0=e1; e1=tmp; }
        // now, we test winding.  If the edge winds positively around
        // the classification point, then it must cross the classification
        // line somewhere to the right of the classification point.
        // (UNLESS the endpoint lies on the classificaiton line, in which
        //  case due to perturbation no crossing exists)
        if(e1[1] >= pxy[1]) return; // no crossing!
        var det = Vec2.cross(Vec2.sub(e0,pxy), Vec2.sub(e1,pxy));
        if(det > 0) n_crossings++;
      }
    }, machine_epsilon);
    // use "0" for epsilon cause it will save us trouble...
    //console.log('crossings=',n_crossings,this._unselect_runs[ri].ps.length);
    if(n_crossings%2 !== 0) {
      contain_test = true;
      break;
    }
  }
  var time1 = performance.now();
  console.log('containment in ms', time1 - time0);

  return contain_test;
}

// NOTE: we assume a lack of polygon-polygon intersection
// in order for this routine to work correctly
SelectionGeometry.loopsContainPolygons = function() {
  if(this.hasOneLoop()) return this._INTERNAL_loopsContainPolygons();
  if(this.hasTwoLoops()) return this._INTERNAL_loopsContainPolygons();

  // do not handle other cases...
  throw new Error('(#Loops > 1) Cases Unhandled');
}

SelectionGeometry.isTwoNestedLoops = function() {
  if(this._cached_two_loops_nested) return this._cached_two_loops_nested;
  if(this._loops.length !== 2)      return false;

  var EPSILON = Math.max(this._bounds.w,this._bounds.h) * 1e-4;
  var machine_epsilon = 5e-324;

  var looppts = this._INTERNAL_LoopPoints();
  var loop0   = looppts[0];
  var loop1   = looppts[1];
  var segtree = this._INTERNAL_LoopsEdgeTree();


  // find the right-most point of each loop
  var maxxpt0 = loop0[0].xy;
  var maxxpt1 = loop1[0].xy;
  var maxpt = Vec2.max(maxxpt0, maxxpt1);
  var minpt = Vec2.min(maxxpt0, maxxpt1);
  for(var k=1; k<loop0.length; k++) {
    if(loop0[k].xy[0] > maxxpt0[0]) maxxpt0 = loop0[k].xy;
    maxpt = Vec2.max(maxpt, loop0[k].xy);
    minpt = Vec2.min(minpt, loop0[k].xy);
  }
  for(var k=1; k<loop1.length; k++) {
    if(loop1[k].xy[0] > maxxpt1[0]) maxxpt1 = loop1[k].xy;
    maxpt = Vec2.max(maxpt, loop1[k].xy);
    minpt = Vec2.min(minpt, loop1[k].xy);
  }

  // (ii) test if within loop
  var use0    = (maxxpt0[0] < maxxpt1[0]);
  var basept  = use0 ? maxxpt0 : maxxpt1;
  var endpt   = [this._bounds.r + 100*EPSILON, basept[1]];
  var testbox = [basept,endpt];
  var n_crossings = 0;
  segtree.doIsct(testbox, function(edge) {
    // Does this edge cross the ray cast out rightwards from basept?
    var e0 = edge[0].xy;
    var e1 = edge[1].xy;
    // are the edge endpoints points to the right of the base point?
    var to_the_right_0 = e0[0] > basept[0];
    var to_the_right_1 = e1[0] > basept[0];
    // If neither are, we can't have intersected
    if(!to_the_right_0 && !to_the_right_1) {
      // no-op
    }
    // If both are, then intersection comes down to whether the
    // two endpoints lie differently above/below the ray
    else if(to_the_right_0 && to_the_right_1) {
      var above0 = e0[1] < basept[1];
      var above1 = e1[1] < basept[1];
      if(above0 !== above1) n_crossings++;
    }
    // In the remaining cases, we need to check winding and above/below
    else {
      // filter based on above/below
      var above0 = e0[1] < basept[1];
      var above1 = e1[1] < basept[1];
      if(above0 !== above1) {
        // If the edge winds positively,
        // then the edge must cross the classification
        var det = Vec2.cross(Vec2.sub(e0,basept), Vec2.sub(e1,basept));
        // adjust to have a canonical direction to test
        if(e0[1] > e1[1]) det = -det;
        if(det > 0) n_crossings++;
      }
    }
  }, machine_epsilon);
  
  // we want evidence that we were inside of the other loop
  // i.e. odd crossings
  this._cached_two_loops_nested = n_crossings%2 === 1;
  return this._cached_two_loops_nested;
}

var SIN_45_DEG = Math.sin(Math.PI / 4.0);
SelectionGeometry._INTERNAL_twoLoopHolePoint = function() {
  var EPSILON = Math.max(this._bounds.w,this._bounds.h) * 1e-4;
  var looppts = this._INTERNAL_LoopPoints();
  var loop0   = looppts[0];
  var loop1   = looppts[1];

  var maxxpt0 = loop0[0].xy;
  var maxxpt1 = loop1[0].xy;
  var id0     = 0;
  var id1     = 0;
  var maxx    = Vec2.max(maxxpt0[0], maxxpt1[0]);
  for(var k=1; k<loop0.length; k++) {
    if(loop0[k].xy[0] > maxxpt0[0]) {
      maxxpt0 = loop0[k].xy;
      id0 = k;
    }
    maxx = Vec2.max(maxx, loop0[k].xy[0]);
  }
  for(var k=1; k<loop1.length; k++) {
    if(loop1[k].xy[0] > maxxpt1[0]) {
      maxxpt1 = loop1[k].xy;
      id1 = k;
    }
    maxx = Vec2.max(maxx, loop1[k].xy[0]);
  }

  var use0  = (maxxpt0[0] < maxxpt1[0]);
  var loop  = use0 ? loop0 : loop1;
  var id    = use0 ? id0   : id1;
  var prev  = loop[(id-1)%loop.length].xy;
  var curr  = loop[id].xy;
  var next  = loop[(id+1)%loop.length].xy;
  var eprev = Vec2.sub(prev,curr);
  var enext = Vec2.sub(next,curr);
  var sin_angle = Math.abs(Vec2.cross(eprev,enext)) /
                  (Vec2.len(eprev)*Vec2.len(enext)) ;
  var halfEPS = EPSILON / 2.0;
  console.log('curr loop pt, p0, p1', curr, maxxpt0, maxxpt1);
  if(sin_angle < SIN_45_DEG) {
    console.log('small sin: halfEPS', halfEPS);
    return [ curr[0] - halfEPS, curr[1] ];
  } else {
    var dir = Vec2.normalized(Vec2.add(eprev,enext));
    console.log('big sin: dir', dir);
    return Vec2.add(curr, Vec2.mul(halfEPS, dir));
  }
}








// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  LOOP TRIANGULATION




var Triangle = {};
Triangle.New = function(id, vs) {
  var tri = Object.create(Triangle);
  tri.id = id;
  tri.vs = vs.slice(); // 3-long array
  tri.tris = [null,null,null];
  return tri;
}
Triangle.cacheVals = function() {
  this.dual_deg = ( this.tris[0] ? 1 : 0 ) +
                  ( this.tris[1] ? 1 : 0 ) +
                  ( this.tris[2] ? 1 : 0 ) ;
}
Triangle.isPolygonEdge = function(k) {
  if(this.tris[k] !== null) return false;
  var vi = this.vs[(k+1)%3];
  var vj = this.vs[(k+2)%3];
  return vi.pgon_next === vj || vi.pgon_prev === vj;
}
Triangle.hasPolygonEdge = function() {
  return this.isPolygonEdge(0) ||
         this.isPolygonEdge(1) || this.isPolygonEdge(2);
}
Triangle.rotateTo0 = function(k) {
  var newvs = [];
  var newtris = [];
  for(var i=0; i<3; i++) {
    var j = (k+i)%3;
    newvs[i]    = this.vs[j];
    newtris[i]  = this.tris[j];
  }
  this.vs   = newvs;
  this.tris = newtris;
}
Triangle.triIdLookup = function(tri) {
  for(var k=0; k<3; k++) {
    if(this.tris[k] === tri) return k;
  }
}
Triangle.vertOppTri = function(tri) {
  return this.vs[this.triIdLookup(tri)];
}
Triangle.getOnlyNeighborTri = function() {
  for(var k=0; k<3; k++) {
    if(this.tris[k]) return this.tris[k];
  }
}
//Triangle.nPolygonEdge = function() {
//  return ( this.isPolygonEdge(0) ? 1 : 0 ) +
//         ( this.isPolygonEdge(1) ? 1 : 0 ) +
//         ( this.isPolygonEdge(2) ? 1 : 0 ) ;
//}


SelectionGeometry.RPCtoTriangle = function(input) {
  var points  = [];
  var pxys    = [];
  var edges   = [];
  var holes   = undefined;
  if(input.pointloops) {
    var write   = 0;
    for(var li=0; li<input.pointloops.length; li++) {
      var loop = input.pointloops[li];
      var N = loop.length;
      for(var k=0; k<N; k++) {
        points[write+k] = loop[k];
        pxys[write+k]   = loop[k].xy;
        edges[write+k]  = [write + k-1, write + k];
      }
      edges[write] = [write + N-1, write];
      write += N;
    }
  } else {
    throw new Error("Could not interpret input to RPC Triangle call.")
  }
  if(input.holes) {
    holes = input.holes;
  }

  var USE_EMSCRIPTEN = true;

  // perform the RPC
  var tris = [];
  if(on_node) {
    throw new Error("NEED TO SUPPORT TRIANGLE CALLS ON NODE");
  }
  else if(USE_EMSCRIPTEN) {
    var tris = emtriangle.triangulate(pxys, edges, holes);
  }
  else {
    //console.log('ajax call begin');
    var reply = $.ajax({
      url: "/",
      type: "POST",
      dataType: "json",
      async: false,
      timeout: 2000,
      data: JSON.stringify({
        funcname: 'triangulate',
        args: [ pxys, edges, holes ],
      }),
    });
    if(reply.status !== 200) {
      console.log('triangle call to server fail:', reply.status);
    } else {
      //console.log('success on ajax');
      var tris = reply.responseJSON;
    }
  }

  return tris.map(function(t) {
    return [ points[t[0]], points[t[1]], points[t[2]] ];
  });
}

SelectionGeometry.triangulateLoops = function() {
  if(this._loops.length > 2)
    throw new Error('> 2 loop triangulation unimplemented');
  if(this.hasTwoLoops() && !this.isTwoNestedLoops())
    throw new Error('given 2 loops they need to be nested');
//  if(!this.hasOneLoop())
//    throw new Error('multi-loop triangulation unimplemented');

  // RPC CALL
  var ptloops = this._INTERNAL_LoopPoints();
  var holes   = undefined;
  if(this.hasTwoLoops())
    holes   = [ this._INTERNAL_twoLoopHolePoint() ];
  var points  = ptloops.flatten();
  var trianglestarttime = performance.now();
  var tris    = this.RPCtoTriangle({
    pointloops: ptloops,
    holes: holes
  });
  var triangleendtime = performance.now();
  console.log('triangle time: ',
              1.0e-3*(triangleendtime - trianglestarttime) );

  // prep the points for the graph
  var ecache = [];
  for(var k=0; k<points.length; k++) {
    points[k].pt_id         = k;
    points[k].tris          = [];
    points[k].verts         = [];
    ecache[k] = {};
  }

  // build the edge-cache and v-t links
  this._triangles = [];
  console.log('triangulateLoops tris', tris);
  for(var id = 0; id < tris.length; id++) {
    var vs = tris[id];
    var tri = Triangle.New(id, vs);

    var vids = []
    for(var k=0; k<3; k++) {
      vs[k].tris.push(tri);

      var vid0 = vs[k].pt_id;
      var vid1 = vs[(k+1)%3].pt_id;
      if(vid0 > vid1) { var tmp = vid0; vid0 = vid1; vid1 = tmp; }
      var lookup = ecache[vid0][vid1];
      if(!lookup) {
        lookup = (ecache[vid0][vid1] = { tri0: tri });
      } else {
        lookup.tri1 = tri;
      }
    }

    this._triangles[id] = tri;
  }

  // process the cached edges into v-v and t-t links
  for(var vid0 = 0; vid0 < ecache.length; vid0++) {
    for(var vid1 in ecache[vid0]) {
      var e = ecache[vid0][vid1];

      var v0 = points[vid0];
      var v1 = points[vid1];
      v0.verts.push(v1);
      v1.verts.push(v0);
      if(e.tri1) {
        var opp0=0; var opp1=0;
        for(var k=0; k<3; k++) {
          if(e.tri0.vs[k] !== v0 && e.tri0.vs[k] !== v1) opp0 = k;
          if(e.tri1.vs[k] !== v0 && e.tri1.vs[k] !== v1) opp1 = k;
        }
        e.tri0.tris[opp0] = e.tri1;
        e.tri1.tris[opp1] = e.tri0;
      }
    }
  }
  // cache any compuatations per triangle we'd like to make
  for(var k=0; k<this._triangles.length; k++)
    this._triangles[k].cacheVals();
}

/*
SelectionGeometry.triangulateLoop = function() {
  if(!this.hasOneLoop())
    throw new Error('multi-loop triangulation unimplemented');

  // RPC CALL
  var points  = this._INTERNAL_LoopPoints()[0];
  var tris    = this.RPCtoTriangle({ pointloops: [points] });

  // prep the points for the graph
  var ecache = [];
  for(var k=0; k<points.length; k++) {
    points[k].pt_id         = k;
    points[k].tris          = [];
    points[k].verts         = [];
    ecache[k] = {};
  }

  // build the edge-cache and v-t links
  this._triangles = [];
  console.log(tris);
  for(var id = 0; id < tris.length; id++) {
    var vs = tris[id];
    var tri = Triangle.New(id, vs);

    var vids = []
    for(var k=0; k<3; k++) {
      vs[k].tris.push(tri);

      var vid0 = vs[k].pt_id;
      var vid1 = vs[(k+1)%3].pt_id;
      if(vid0 > vid1) { var tmp = vid0; vid0 = vid1; vid1 = tmp; }
      var lookup = ecache[vid0][vid1];
      if(!lookup) {
        lookup = (ecache[vid0][vid1] = { tri0: tri });
      } else {
        lookup.tri1 = tri;
      }
    }

    this._triangles[id] = tri;
  }

  // process the cached edges into v-v and t-t links
  for(var vid0 = 0; vid0 < ecache.length; vid0++) {
    for(var vid1 in ecache[vid0]) {
      var e = ecache[vid0][vid1];

      var v0 = points[vid0];
      var v1 = points[vid1];
      v0.verts.push(v1);
      v1.verts.push(v0);
      if(e.tri1) {
        var opp0=0; var opp1=0;
        for(var k=0; k<3; k++) {
          if(e.tri0.vs[k] !== v0 && e.tri0.vs[k] !== v1) opp0 = k;
          if(e.tri1.vs[k] !== v0 && e.tri1.vs[k] !== v1) opp1 = k;
        }
        e.tri0.tris[opp0] = e.tri1;
        e.tri1.tris[opp1] = e.tri0;
      }
    }
  }
  // cache any compuatations per triangle we'd like to make
  for(var k=0; k<this._triangles.length; k++)
    this._triangles[k].cacheVals();
}
*/

SelectionGeometry.displayTriangles = function() {
  return this._triangles.map(function(tri) {
    return [
      tri.vs[0].orig,
      tri.vs[1].orig,
      tri.vs[2].orig
    ];
  });
}

SelectionGeometry.triangleTopoStats = function() {
  // count the number of components / genus / etc.
  if(this._cached_topo_stats) return this._cached_topo_stats;

  // mark triangles for traversal
  for(var k=0; k<this._triangles.length; k++) {
    this._triangles[k]._topo_stat_unvisited = true;
  }

  var components = [];

  this._triangles.forEach(function(root_tri) {
    if(!root_tri._topo_stat_unvisited) return;

    var n_twice_edges = 0;
    var n_triangles   = 0;
    function recurse(tri) {
      // terminate when repeatedly visiting
      if(!tri._topo_stat_unvisited) return;
      // mark that we've visited and count this triangle
      delete tri._topo_stat_unvisited;
      n_triangles++;

      // find neighbors who we didn't just come from
      // and traverse those edges
      for(var k=0; k<3; k++) {
        var next = tri.tris[k];
        if(next) {
          n_twice_edges++;
          recurse(next);
        } 
      }
    }
    recurse(root_tri);
    components.push({
      n_edges:      n_twice_edges/2,
      n_triangles:  n_triangles,
      n_holes:      n_twice_edges/2 - n_triangles + 1,
    });
  });

  this._cached_topo_stats = {
    components: components
  };
  return this._cached_topo_stats;
}



// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  Finding the longest path in a disk

function triangleEstimateLengths(triangles) {
  triangles.forEach(function(tri) {
    if(tri.dual_deg == 2) {
      // find the unconnected edge
      // and use its length
      for(var k=0; k<3; k++) {
        if(!tri.tris[k]) {
          var v0 = tri.vs[(k+1)%3];
          var v1 = tri.vs[(k+2)%3];
          var edge = Vec2.sub(v1.xy, v0.xy);
          tri._estimated_length = Vec2.len(edge);
          break;
        }
      }
    } else
    {
      // average all the edges
      var avg = 0;
      for(var k=0; k<3; k++) {
        var v0 = tri.vs[(k+1)%3];
        var v1 = tri.vs[(k+2)%3];
        var elen = Vec2.len(Vec2.sub(v1.xy, v0.xy));
        // don't count the connecting edge in the endcap case
        if(tri.dual_deg == 1 && !tri.tris[k]) {
          // don't count
        } else {
          avg += elen;
        }
      }
      avg /= (tri.dual_deg == 1)? 2 : 3;
      tri._estimated_length = avg/2; // maybe remove?
    }
  });
}

// set up a hierchical tree with specified root
// make it left-heavy for simplicity
function hoist_triangle_tree(root_tri) {
  if(root_tri.dual_deg === 3) throw new Error('deg 3 root unsupported');

  function recurse(tri, parent) {
    var left;
    var right;
    for(var k=0; k<3; k++) {
      var next = tri.tris[k];
      if(next && next !== parent) {
             if(!left) left = next;
        else if(!right) right = next;
        else throw new Error("Impossible case in Hoisting");
        recurse(next, tri);
      }
    }
    tri._left_tri   = left;
    tri._right_tri  = right;
  }
  recurse(root_tri);
}
function clear_triangle_hoisting(triangles) {
  for(var k=0; k<triangles.length; k++) {
    delete triangles[k]._left_tri;
    delete triangles[k]._right_tri;
  }
}

SelectionGeometry.isSingleDisk = function() {
  var stats = this.triangleTopoStats();
  return (stats.components.length === 1 &&
          stats.components[0].n_holes === 0);
}

SelectionGeometry.findLongestDualPathInDisk = function() {
  if(!this.isSingleDisk()) throw new Error('Require Disk Topology');
  // setup: estimate lengths and build a tree to recurse on
  triangleEstimateLengths(this._triangles);
  // pick a degree < 3 node as the root
  var root_tri;
  for(var k=0; k<this._triangles.length; k++) {
    if(this._triangles[k].dual_deg < 3) {
      root_tri = this._triangles[k];
      break;
    }
  }
  // and fix a hierarchy for the tree with the given root
  hoist_triangle_tree(root_tri);

  // compute the maximum path length starting at a given node
  // and travelling strictly downward; cache results
  function pass_1(tri) {
    var left_path  = (tri._left_tri)?  pass_1(tri._left_tri)  : undefined;
    var right_path = (tri._right_tri)? pass_1(tri._right_tri) : undefined;
    tri.left_path = left_path;
    tri.right_path = right_path;

    var longest_path = left_path;
    if(right_path && right_path.len > left_path.len)
      longest_path = right_path;
    var len = (longest_path)? longest_path.len : 0;

    return {
      tri:  tri,
      next: longest_path,
      len:  len + tri._estimated_length,
    };
  }
  pass_1(root_tri);

  // Find the longest global path
  var longest_global_path = { tri: null, next: undefined, len: 0 };
  function pass_2(tri, up_path) {
    if(!tri) return;

    var up_len    = up_path        ? up_path.len        : 0;
    var left_len  = tri.left_path  ? tri.left_path.len  : 0;
    var right_len = tri.right_path ? tri.right_path.len : 0;
    up_len    += tri._estimated_length;
    left_len  += tri._estimated_length;
    right_len += tri._estimated_length;

    var is_root = !up_path;
    var up_extend = {
      tri:  tri,
      next: up_path,
      len:  up_len,
    };
    //console.log('isroot', is_root, up_len, left_len, right_len);

    // if we have a longer path without using the upward path, then bypass
    if(!is_root && up_len < left_len && up_len < right_len)
      is_root = true;

    // root case
    if(is_root) {
      // use the right as the "upward" path
      var right_extend = { tri: tri, next: tri.right_path, len: right_len };
      pass_2(tri._left_tri, right_extend);
      pass_2(tri._right_tri, undefined);

    // leaf case
    } else if(!tri._left_tri) {
      // see if this is the best path so far!
      //console.log('comp ', longest_global_path.len, up_extend.len)
      if(up_extend.len > longest_global_path.len)
        longest_global_path = up_extend;

    // common case; extend path downwards
    } else {
      if(left_len >= right_len) {
        pass_2(tri._left_tri,  up_extend);
        pass_2(tri._right_tri, undefined);
      } else {
        pass_2(tri._left_tri,  undefined);
        pass_2(tri._right_tri, up_extend);
      }
    }
  }
  pass_2(root_tri)

  // spool out the path into an array
  var longest_dual_path = (this._longest_dual_path = []);
  var path = longest_global_path;
  while(path) {
    longest_dual_path.push(path.tri);
    path = path.next;
  }
  //console.log('path', longest_global_path)

  // cleanup
  clear_triangle_hoisting(this._triangles);
  this._triangles.forEach(function(tri) {
    delete tri.left_path;
    delete tri.right_path;
  });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  Finding the loop in a genus 1 selection

SelectionGeometry.isSingleAnnulus = function() {
  var stats = this.triangleTopoStats();
  return (stats.components.length === 1 &&
          stats.components[0].n_holes === 1);
}

SelectionGeometry.findLoopInAnnulus = function() {
  // we can do this by pruning all the branches that terminate somewhere
  // necessarily we're left with a loop

  // first mark all of the triangles, and then we'll unmark as we go
  this._triangles.forEach(function(tri) {
    tri._in_annulus_loop = true;
  });

  function find_annulus_neighbor(tri) {
    for(var k=0; k<3; k++) {
      if(tri.tris[k] && tri.tris[k]._in_annulus_loop)
        return tri.tris[k];
    }
    return null;
  }

  // PRUNE
  for(var triid=0; triid<this._triangles.length; triid++) {
    var tri = this._triangles[triid];
    if(!tri._in_annulus_loop) continue;

    // found the end of some branch, start pruning
    if(tri.dual_deg === 1) {
      delete tri._in_annulus_loop;
      var curr = tri.tris[0] || tri.tris[1] || tri.tris[2];
      while(curr.dual_deg < 3 || curr._is_annulus_visited_branch) {
        delete curr._in_annulus_loop;

        // find the next triangle
        curr = find_annulus_neighbor(curr);
      }
      curr._is_annulus_visited_branch = true;
    }
  }

  // EXTRACT
  var firsttri = null;
  for(var triid=0; triid<this._triangles.length; triid++) {
    if(this._triangles[triid]._in_annulus_loop) {
      firsttri = this._triangles[triid];
      break;
    }
  }
  // crawl along the loop path to construct
  var tripath = [firsttri];
  delete firsttri._in_annulus_loop;
  var nexttri = find_annulus_neighbor(firsttri);
  while(nexttri) {
    tripath.push(nexttri);
    delete nexttri._in_annulus_loop;

    nexttri = find_annulus_neighbor(nexttri);
  }

  var annulus_loop = (this._annulus_loop = tripath);

  // CLEANUP
  this._triangles.forEach(function(tri) {
    delete tri._is_annulus_visited_branch; });
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
//  STROKE GEOMETRY


SelectionGeometry._INTERNAL_BuildDiskStrokeToplogy = function() {
  // find the longest path
  this.findLongestDualPathInDisk();
  var path = this._longest_dual_path;
  var N    = path.length;

  // to simplify, clip off the endpoints
  if(path.length <= 2) return false;

  // things we need to build
  var fwd_side    = [];
  var rev_side    = [];
  var begin_side  = [];
  var end_side    = [];
  var spine       = [];

  // re-orient the end triangles that we're going to discard
  path[0].rotateTo0(path[0].triIdLookup(path[1]));
  path[N-1].rotateTo0(path[N-1].triIdLookup(path[N-2]));

  // record begin and end sides
  begin_side = [   path[0].vs[2],   path[0].vs[0],   path[0].vs[1] ];
  end_side   = [ path[N-1].vs[2], path[N-1].vs[0], path[N-1].vs[1] ];

  // Initialize forward/reverse
  fwd_side = [path[0].vs[1]];
  rev_side = [path[0].vs[2]];

  // Setup Spine functions
  function push_onto_spine() {
    var f = fwd_side[fwd_side.length-1];
    var r = rev_side[rev_side.length-1];
    spine.push([f,r]);
  }
  push_onto_spine();

  // walk down the path
  for(var k=1; k<N-1; k++) {
    var prev = path[k-1];
    var curr = path[k];
    var next = path[k+1];

    // setup linked list
    if(k > 1) {
      prev.stroke_next = curr;
      curr.stroke_prev = prev;
    }

    // find the apex and base
    var a_i = 0;
    for(; a_i < 3; a_i++) {
      if(prev !== curr.tris[a_i] && next !== curr.tris[a_i]) break;
    }
    var a     = curr.vs[a_i];
    var b0    = curr.vs[(a_i+1)%3];
    var b1    = curr.vs[(a_i+2)%3];
    curr.apex = a;
    curr.base = [ b0, b1 ];

    // advance either the forward or reverse side lists
    var fwdapex = (a === fwd_side[fwd_side.length-1]);
    if(fwdapex) rev_side.push(b0);
    else        fwd_side.push(b1);
    push_onto_spine();
  }

  this._stroke_topo = {
    tris:         path.slice(1,N-1),
    begin:        path[1],
    end:          path[N-2],
    forward_side: fwd_side,
    reverse_side: rev_side,
    begin_side:   begin_side,
    end_side:     end_side,
    spine_list:   spine,
  };
  return true;
}

SelectionGeometry._INTERNAL_BuildAnnulusStrokeToplogy = function() {
  console.log('annulus build topo')
  // find the longest path
  this.findLoopInAnnulus();
  var path = this._annulus_loop;
  var N    = path.length;

  // things we need to build
  var fwd_side    = [];
  var rev_side    = [];
  var begin_side  = []; // we're leaving these blank...
  var end_side    = []; // we're leaving these blank...
  var spine       = [];

  // re-orient the initial triangle
  path[0].rotateTo0(path[0].triIdLookup(path[N-1]));

  // Initialize forward/reverse
  fwd_side = [path[0].vs[2]];
  rev_side = [path[0].vs[1]];

  // Setup Spine functions
  function push_onto_spine() {
    var f = fwd_side[fwd_side.length-1];
    var r = rev_side[rev_side.length-1];
    spine.push([f,r]);
  }
  push_onto_spine();

  // walk down the path
  for(var k=0; k<N; k++) {
    var pi = (k-1 < 0)? N-1 : k-1;
    var ni = (k+1 === N)? 0 : k+1;
    var prev = path[pi];
    var curr = path[k];
    var next = path[ni];

    // setup linked list
    prev.stroke_next = curr;
    curr.stroke_prev = prev;

    // find the apex and base
    var a_i = 0;
    for(; a_i < 3; a_i++) {
      if(prev !== curr.tris[a_i] && next !== curr.tris[a_i]) break;
    }
    var a     = curr.vs[a_i];
    var b0    = curr.vs[(a_i+1)%3];
    var b1    = curr.vs[(a_i+2)%3];
    curr.apex = a;
    curr.base = [ b0, b1 ];

    // advance either the forward or reverse side lists
    var fwdapex = (a === fwd_side[fwd_side.length-1]);
    if(fwdapex) rev_side.push(b0);
    else        fwd_side.push(b1);
    push_onto_spine();
  }

  this._stroke_topo = {
    tris:         path,
    begin:        path[0],
    end:          path[N-1],
    forward_side: fwd_side,
    reverse_side: rev_side,
    begin_side:   begin_side,
    end_side:     end_side,
    spine_list:   spine,
  };
  return true;
}

SelectionGeometry.buildStrokeTopology = function() {
  // idempotency/recomputation guard
  if(this._stroke_topo !== undefined) return !!this._stroke_topo;

  // by default we failed, until we certify otherwise
  this._stroke_topo = false;

  // dispatch to two cases
  if(this.isSingleDisk())
    return this._INTERNAL_BuildDiskStrokeToplogy();
  if(this.isSingleAnnulus())
    return this._INTERNAL_BuildAnnulusStrokeToplogy();

  return false;
}

SelectionGeometry.hasStrokeTopology = function() {
  if(this._stroke_topo === undefined) this.buildStrokeTopology();
  console.log('stroke topo', this._stroke_topo)
  return !!this._stroke_topo;
}


function pt_list_len(pts) {
  var sumlen = 0;
  var prevpt = pts[0];
  for(var k=1; k<pts.length; k++) {
    sumlen += Vec2.len(Vec2.sub(pts[k].xy, prevpt.xy));
    prevpt = pts[k];
  }
  return sumlen;
}
SelectionGeometry.strokeSideLengths = function() {
  if(!this._stroke_topo) return;
  if(this._stroke_topo.reverse_sidelength === undefined) {
    // compute and cache
    var fwdlen = pt_list_len(this._stroke_topo.forward_side);
    var revlen = pt_list_len(this._stroke_topo.reverse_side);
    var blen   = pt_list_len(this._stroke_topo.begin_side);
    var elen   = pt_list_len(this._stroke_topo.end_side);

    this._stroke_topo.forward_sidelength = fwdlen;
    this._stroke_topo.reverse_sidelength = revlen;
    this._stroke_topo.begin_sidelength   = blen;
    this._stroke_topo.end_sidelength     = elen;
  }
  return {
    forward: this._stroke_topo.forward_sidelength,
    reverse: this._stroke_topo.reverse_sidelength,
    begin:   this._stroke_topo.begin_sidelength,
    end:     this._stroke_topo.end_sidelength,
  }
}
SelectionGeometry.strokeSides = function() {
  if(!this._stroke_topo) return;
  var topo = this._stroke_topo;
  return {
    forward: topo.forward_side.map(function(p) { return p.orig; }),
    reverse: topo.reverse_side.map(function(p) { return p.orig; }),
    begin:   topo.begin_side.map(function(p) { return p.orig; }),
    end:     topo.end_side.map(function(p) { return p.orig; }),
  };
}
SelectionGeometry.strokeSpine = function() {
  return this._stroke_topo.spine_list.map(function(pair) {
    var xy0 = pair[0].orig.getxy();
    var xy1 = pair[1].orig.getxy();
    return Vec2.mul( 0.5, Vec2.add(xy0,xy1) );
  });
}

SelectionGeometry.forStrokeTris = function(func) {
  var tris = this._stroke_topo.tris;
  for(var k=0; k<tris.length; k++) {
    var b0 = tris[k].base[0].orig;
    var b1 = tris[k].base[1].orig;
    var a  = tris[k].apex.orig;
    func(b0, b1, a);
  }
}











})(typeof window === 'undefined');
