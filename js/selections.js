/*  
 *  selections.js
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
var exports = on_node? module.exports : window['selections']={};



// modules
if(on_node) {
  var primitives  = require('./primitives');
  var isct        = require('./isct');
  var contours    = require('./contours');
  var constraints = require('./constraints');
  var numeric_subroutines = require('./numeric_subroutines');
  var selectiongeometry = require('./selectiongeometry');
} else {
  var primitives  = window.primitives;
  var isct        = window.isct;
  var contours    = window.contours;
  var constraints = window.constraints;
  var numeric_subroutines = window.numeric_subroutines;
  var selectiongeometry   = window.selectiongeometry;
  if(!primitives || !isct || !contours || !constraints ||
     !numeric_subroutines || !selectiongeometry)
    throw new Error(
      "Must have Primitives, Isct, Contours, Constraints, "+
      "Numeric Subroutines, and Geometry Selection "+
      " Modules loaded before Selections");
}


// IMPORTS
var Scalar              = primitives.Scalar;
var Vec2                = primitives.Vec2;
var Box2                = primitives.Box2;

var AABVH               = isct.AABVH;

var Polyline            = contours.Polyline;

var TriHeight           = constraints.TriHeight;
var Average             = constraints.Average;
var AvgRadius           = constraints.AvgRadius;

var SelectionGeometry   = selectiongeometry.SelectionGeometry;

var covariance_analysis = numeric_subroutines.covariance_analysis;
function covar_of_set(set) {
  return covariance_analysis(set.toArray().map(function(pt) {
    return pt.getxy();
  }));
}



// DECLARATIONS
var Proposal      = (exports.Proposal  = {});
var Selection     = (exports.Selection = {});

var Stroke        = (exports.Stroke = Object.create(Selection));
var Blob          = (exports.Blob   = Object.create(Selection));
var Rectangle     = (exports.Rectangle = Object.create(Selection));






// IMPLEMENTATIONS
function pt_bounds(points) {
  var res = { l: Infinity, r: -Infinity, t: Infinity, b: -Infinity };
  points.forEach(function(pt) {
    var xy = pt.getxy();
    res.l = Math.min(xy[0], res.l);
    res.r = Math.max(xy[0], res.r);
    res.t = Math.min(xy[1], res.t);
    res.b = Math.max(xy[1], res.b);
  });
  res.w = res.r - res.l;
  res.h = res.b - res.t;
  return res;
}

Proposal.New = function(prev_selection, invert) {
  var prop = Object.create(Proposal);
  prop._prev   = prev_selection;
  prop._invert = invert;
  prop._points = (invert)? prev_selection.points() : new Set();
  return prop;
}
Proposal.points = function() { return this._points }
Proposal.marquee = function(all_points, rect) {
  var circled = all_points.filter(function(pt) {
    var xy = pt.getxy();
    return xy[0] >= rect.l && xy[0] <= rect.r &&
           xy[1] >= rect.t && xy[1] <= rect.b ;
  });

  this._points = (this._invert)? this._prev.points().symmDiff(circled) :
                                 circled ;
}
Proposal.annulus = function(all_points, rect, width) {
  var hw = 0.5*width;
  var circled = all_points.filter(function(pt) {
    var xy = pt.getxy();
    var tl = Vec2.sub(xy, [rect.l,rect.t]);
    var br = Vec2.sub(xy, [rect.r,rect.b]);

    var in_box = tl[0] >= -hw && tl[1] >= -hw &&
                 br[0] <=  hw && br[1] <=  hw ;
    var near_side = Math.abs(tl[0]) <= hw || Math.abs(tl[1]) <= hw ||
                    Math.abs(br[0]) <= hw || Math.abs(br[1]) <= hw ;

    return in_box && near_side;
  });

  this._points = circled;
  this._annulus = { l:rect.l, r:rect.r, t:rect.t, b:rect.b, annulus_w:width };
}
Proposal.commitSelection = function(polygons, filter) {
  if(filter === 'rectangle') {
    if(!this._annulus) return Selection.New(this._points);

    console.log('trying to form annulus');
    var rectangle = Rectangle.New(this._points, this._annulus);
    if(rectangle) return rectangle;
    console.log('not a valid rectangle');
    return Selection.New(this._points);
  }

  var geometry        = SelectionGeometry.New(this._points, polygons);
  geometry.doLoopClosure();

  var default_select  = Selection.New(this._points);
  var has_1or2 = geometry.hasOneLoop() || geometry.hasTwoLoops();
  if(!has_1or2)                                 return default_select;
  console.log('there are 2 or fewer loops');
  if(geometry.loopsAreIntersectingPolygons())   return default_select;
  console.log('loops do not intersect polygons');
  if(geometry.loopsAreSelfIntersecting())       return default_select;
  console.log('loops do not self-intersect');
  if(geometry.loopsContainPolygons())           return default_select;
  console.log('loops do not contain polygons');
  if(geometry.hasIsolatedLoopPoints())          return default_select;
  console.log('no loop points are isolated');

  // try to build more complex selections with fall-through on failure
  if(!filter || filter === 'stroke') {
    var stroke = Stroke.New(this._points, geometry);
    if(stroke) return stroke;
    console.log('not a stroke');
  }

  if(!filter || filter === 'blob') {
    var blob = Blob.New(this._points, geometry);
    if(blob) return blob;
    console.log('not a blob');
  }

  return default_select;
}



Selection.isBlob = function() { return false; }
Selection.isStroke = function() { return false; }
Selection.isRectangle = function() { return false; }
Selection.isNonTrivial = function() { return false; }
Selection.New = function(points) {
  var sel = Object.create(Selection);
  sel._points     = points || new Set();
  return sel;
}
Selection.isEmpty = function() { return this._points.size <= 0; }
Selection.points  = function() { return this._points; }

Selection.drawableLoop = function() {
  if(!this._geometry) return null;
  if(!this._drawable_loop) {
    this._drawable_loop = this._geometry.pointLoops()[0];
  }
  return this._drawable_loop;
}
//Selection.legacyLoop = function() {
//  if(!this._loop)
//    this._loop = this._geometry.legacyLoops()[0];
//}
//Selection.loopIsOneClosedContour = function() {
//  this.legacyLoop();
//  return this._loop.length === 1 && this._loop[0].isClosed();
//}
Selection.getLoops = function() {
  return this._geometry.legacyLoops();
  //this.legacyLoop();
  //return this._loop.slice();
}
/*Selection.loopSplitPoints = function() {
  this.legacyLoop();
  if(!this._loop) return [];
  if(this.loopIsOneClosedContour()) return [];

  var pts = [];
  this._loop.forEach(function(pl) {
    pts.push(pl.start());
    pts.push(pl.end());
  });
  return pts;
}
Selection.loopSplitGaps = function() {
  this.legacyLoop();
  if(!this._loop) return [];
  if(this.loopIsOneClosedContour()) return [];

  var pairs = [];
  var lastpt = this._loop[this._loop.length-1].end();
  for(var k=0; k<this._loop.length; k++) {
    var pt = this._loop[k].start();
    pairs.push([pt, lastpt]); // gap orientation will be reversed...
    lastpt = this._loop[k].end();
  }
  return pairs;
}*/

//Selection.topoDelete = function() {} // no-op by default

// BROWSER ONLY
if(!on_node) {
  Selection.hasSlider = function() {
    return !!this._slider;
  }
  Selection.clearSlider = function() {
    if(this.hasSlider()) {
      rawdisplay.removeWidget(this._slider);
    }
    delete this._slider;
  }
  Selection.repositionSlider = function() {
    if(!this.hasSlider()) return;
    var bounds = pt_bounds(this._points);
    this._slider.resetAnchor({
      anchor: [ bounds.l, (bounds.t + bounds.b)/2 ],
    });
  }
  function common_gen_slider(select, workspace) {
    var bounds = pt_bounds(select._points);
    var anchor = [ bounds.l, (bounds.t + bounds.b)/2 ];
    var slider = widgets.Slider.New({
      anchor: anchor, width: 30, height: 200,
      anchored_view: workspace,
      relative_pos: 'center-left', anchor_dist: 20,
      alpha: 0.7,
    });
    select._slider = slider;
    return slider;
  }
}


// --------------------------------------------------------------------------
// --------------------------------------------------------------------------


Blob.isBlob = function() { return true; }
Blob.isNonTrivial = function() { return true; }
Blob.New = function(points, geometry) {
  var blob = Object.create(Blob);
  blob._points    = points || new Set();
  blob._geometry  = geometry;
  if(!blob.isValid()) return null;

  blob._init_center = blob.measureCenter();
  blob._init_radius = blob.measureRadius(blob._init_center);
  blob._curr_center = blob._init_center;
  blob._curr_radius = blob._init_radius;
  return blob;
}
Blob.isValid = function() {
  if(!this._geometry.hasOneLoop()) return null;
  if(this._points.size <= 2) return false;
  // do a covariance analysis
  var data = covar_of_set(this._points);
  // use the ratio of 
  var ratio = data.eigen2 / data.eigen1;
  console.log('blob ratio', ratio, data);
  if(ratio > 0.5) return true;
  return false;
}
Blob.measureCenter = function() {
  var mean = [0,0];
  var N = this._points.size;
  this._points.forEach(function(pt) {
    mean = Vec2.add(mean, pt.getxy());
  });
  mean = Vec2.mul(1/N, mean);
  return mean;
}
Blob.measureRadius = function(center) {
  if(!center) center = this.measureCenter();

  var avg_radius = 0;
  var N = this._points.size;
  this._points.forEach(function(pt) {
    avg_radius += Vec2.len( Vec2.sub(pt.getxy(), center) );
  });
  avg_radius /= N;
  return avg_radius;
}
Blob.getCenter = function() { return this._center_var; }
Blob.getRadius = function() { return this._avgrad_var; }

Blob.analyze = function() { // computes constraints etc.
  if(this._constraints) return; // idempotent

  var centerxy  = this.measureCenter();
  var avgradval = this.measureRadius(centerxy);

  this._center_var  = Vec2.New(centerxy);
  this._avgrad_var  = Scalar.New(avgradval);
  this._init_avgrad = avgradval;

  // now compute the constraints...
  this._constraints = [ AvgRadius.New(this._points.toArray(),
                                      this._center_var, this._avgrad_var) ];
}
Blob.constraints = function() {
  return this._constraints;
}
Blob.dragRadius = function(target_radius, solver) {
  console.log('dragradius', this._curr_radius);
  // scale of displacement relative to current length
  var scale = target_radius/this._init_radius - 1;

  var N = this._points.size; // scale to get a reasonable effect
  var forces = [{
    scalar: this._avgrad_var,
    force: N*(target_radius - this._avgrad_var.get()),
  }];

  solver.solveForceField(forces);
  //this._solver.debugResponseToForceField(forces);
}

// BROWSER ONLY
if(!on_node) {
  Blob.genSlider = function(the_doc, the_bureau) {
    var blob = this;
    if(blob._slider) blob.clearSlider();

    var slider = common_gen_slider(blob, the_bureau.main_workspace);
    rawdisplay.addWidget(slider);
    //blob._solver = the_doc.slv;
    //blob._analyzer = the_doc.analyzer;

    // rebuild the constraint problem with extra constraints for selection
    //blob._solver.clear();
    //blob._solver.addConstraints(blob._analyzer.constraints());
    //blob.analyze();
    //blob._solver.addConstraints(blob.constraints());

    function update_and_draw() {
      var curr_rad = blob._avgrad_var.get();
      slider.setValue(0.5 * curr_rad/blob._init_avgrad);
      //rawdisplay.refresh();
    }
    slider.onDragStart(function(newval, oldval) {
      var target_radius = (2*newval) * blob._init_avgrad;
      the_bureau.startAction(
        uiaction.DragBlobWidthAction.New(the_doc, blob),
        { target_radius: target_radius });
      update_and_draw();
    });
    slider.onDragMove(function(newval, oldval) {
      var target_radius = (2*newval) * blob._init_avgrad;
      the_bureau.continueAction({ target_radius: target_radius });
      update_and_draw();
    });
    slider.onDragEnd(function() {
      the_bureau.endAction();
    });
  }
}


// --------------------------------------------------------------------------


Stroke.isStroke = function() { return true; }
Stroke.isNonTrivial = function() { return true; }
Stroke.New = function(points, geometry) {
  var stroke = Object.create(Stroke);
  stroke._points    = points || new Set();
  stroke._geometry  = geometry;

  if(geometry.hasTwoLoops() && !geometry.isTwoNestedLoops())
    return null;
  //stroke._geometry.triangulateLoop();
  stroke._geometry.triangulateLoops();
  if(!stroke.isValid()) return null;

  return stroke;
}
Stroke.isValid = function() {
  if(this._points.size <= 2) return false;

  // stroke topologize!
  if(!this._geometry.hasStrokeTopology()) return false;

  var len = this._geometry.strokeSideLengths();
  var sideratio = Math.max(len.forward, len.reverse) /
                  Math.min(len.forward, len.reverse);
  var capratio  = Math.max(len.begin, len.end) /
                  Math.min(len.begin, len.end);
  if(len.begin <= 0 && len.end <= 0) capratio = 1; // annulus case
  console.log('side ratio', sideratio, 'cap ratio', capratio, len);

  if(sideratio > 3 || capratio > 3) return false;

  return true;
}

Stroke.getSides = function() {
  var sides = this._geometry.strokeSides();
  return sides;
}
Stroke.getSpine = function() {
  var spine = this._geometry.strokeSpine();
  return spine;
}
Stroke.analyze = function() {
  if(this._constraints) return; // idempotent

  var stroke = this;
  stroke._geometry.buildStrokeTopology();

  stroke._constraints = [];
  stroke._tri_h_vars  = [];
  //stroke._width_var = undefined; // assigned below
  var measured_width = 0;

  stroke._geometry.forStrokeTris(function(base0, base1, apex) {
    var b0 = base0.getxy();
    var b1 = base1.getxy();
    var a  = apex.getxy();

    // Ensure that the base vertices are ordered so we have positive area
    var area = Vec2.cross(Vec2.sub(b1,b0),Vec2.sub(a,b0));
    if(area < 0) {
      var tmppt = base0; base0 = base1; base1 = tmppt;
      var tmpxy = b0;    b0    = b1;    b1    = tmpxy;
    }

    // compute the height of the triangle
    var height = TriHeight.computeHeight(b0, b1, a);
    measured_width += height;
    var h = Scalar.New(height);
    stroke._tri_h_vars.push(h);
    // record a constraint
    stroke._constraints.push(TriHeight.New(base0, base1, apex, h));
  });

  measured_width /= stroke._tri_h_vars.length;
  this._init_width = measured_width;
  stroke._width_var = Scalar.New(measured_width);
  stroke._constraints.push(Average.New(stroke._tri_h_vars, stroke._width_var));
}
Stroke.constraints = function() {
  return this._constraints;
}
Stroke.dragWidth = function(target_width, solver) {
  // scale of displacement relative to current length
  var scale = target_width/this._init_width - 1;

  var N = this._tri_h_vars.length; // scale to get a reasonable effect
  var forces = [{
    scalar: this._width_var,
    force: N*(target_width - this._width_var.get()),
  }];

  solver.solveForceField(forces);
  //this._solver.debugResponseToForceField(forces);
}

// BROWSER ONLY
if(!on_node) {
  Stroke.genSlider = function(the_doc, the_bureau) {
    var stroke = this;
    if(stroke._slider) stroke.clearSlider();

    var slider  = common_gen_slider(stroke, the_bureau.main_workspace);
    rawdisplay.addWidget(slider);
    //stroke._solver    = the_doc.slv;
    //stroke._analyzer  = the_doc.analyzer;

    // rebuild the constraint problem with extra constraints for selection
    //stroke._solver.clear();
    //stroke._solver.addConstraints(stroke._analyzer.constraints());
    //stroke.analyze();
    //stroke._solver.addConstraints(stroke.constraints());

    function update_and_draw() {
      var curr_width = stroke._width_var.get();
      slider.setValue(0.5 * curr_width / stroke._init_width);
      //rawdisplay.refresh();
    }
    slider.onDragStart(function(newval, oldval) {
      var target_width = (2*newval) * stroke._init_width;
      the_bureau.startAction(
        uiaction.DragStrokeWidthAction.New(the_doc, stroke),
        { target_width: target_width });
      update_and_draw();
    });
    slider.onDragMove(function(newval, oldval) {
      var target_width = (2*newval) * stroke._init_width;
      the_bureau.continueAction({ target_width: target_width });
      update_and_draw();
    });
    slider.onDragEnd(function() {
      the_bureau.endAction();
    });
  }
}


// --------------------------------------------------------------------------


Rectangle.isRectangle = function() { return true; }
Rectangle.isNonTrivial = function() { return true; }
Rectangle.New = function(points, annulus) {
  var rect = Object.create(Rectangle);
  rect._points    = (points = points || new Set());
  // form sides
  var ann         = annulus;
  var w           = ann.annulus_w;
  var hw          = 0.5*w;
  rect._ptsides = {
    l:  points.filter(function(pt) {
          return Math.abs(pt.getx() - ann.l) <= hw;
        }),
    r:  points.filter(function(pt) {
          return Math.abs(pt.getx() - ann.r) <= hw;
        }),
    t:  points.filter(function(pt) {
          return Math.abs(pt.gety() - ann.t) <= hw;
        }),
    b:  points.filter(function(pt) {
          return Math.abs(pt.gety() - ann.b) <= hw;
        }),
  };
  if(!rect.isValid()) return null;

  rect._init_rect = rect.measureRect();
  return rect;
}
Rectangle.isValid = function() {
  return  this._ptsides.l.size > 0 && this._ptsides.r.size > 0 &&
          this._ptsides.t.size > 0 && this._ptsides.b.size > 0 ;
}
Rectangle.measureRect = function() {
  var sides = { l:0, r:0, t:0, b:0, w:0, h:0, };
  //console.log('rectobj', this);

  this._ptsides.l.forEach(function(pt) { sides.l += pt.getx(); });
  sides.l /= this._ptsides.l.size;
  this._ptsides.r.forEach(function(pt) { sides.r += pt.getx(); });
  sides.r /= this._ptsides.r.size;
  this._ptsides.t.forEach(function(pt) { sides.t += pt.gety(); });
  sides.t /= this._ptsides.t.size;
  this._ptsides.b.forEach(function(pt) { sides.b += pt.gety(); });
  sides.b /= this._ptsides.b.size;

  sides.w = sides.r - sides.l;
  sides.h = sides.b - sides.t;
  return sides;
}
Rectangle.getSides = function() { return this._side_vars; }
Rectangle.getCurrSides = function() {
  return {
    l: this._side_vars.l.get(),
    r: this._side_vars.r.get(),
    t: this._side_vars.t.get(),
    b: this._side_vars.b.get(),
  };
}

Rectangle.analyze = function() { // computes constraints etc.
  if(this._constraints) return; // idempotent

  var rect      = this.measureRect();
  var sides     = (this._side_vars = {
    l: Scalar.New(rect.l),
    r: Scalar.New(rect.r),
    t: Scalar.New(rect.t),
    b: Scalar.New(rect.b),
  });

  this._constraints = [
    Average.New( this._ptsides.l.toArray().map(function(pt){ return pt.x(); }),
                 sides.l ),
    Average.New( this._ptsides.r.toArray().map(function(pt){ return pt.x(); }),
                 sides.r ),
    Average.New( this._ptsides.t.toArray().map(function(pt){ return pt.y(); }),
                 sides.t ),
    Average.New( this._ptsides.b.toArray().map(function(pt){ return pt.y(); }),
                 sides.b ),
  ];
}
Rectangle.constraints = function() {
  return this._constraints;
}
Rectangle.dragSide = function(side, target_val, solver) {
  //console.log('dragside', side, target_val);
  var Nside = this._ptsides[side].size;

  var forces = [{
    scalar: this._side_vars[side],
    force:  Nside * (target_val - this._side_vars[side].get()),
  }];

  solver.solveForceField(forces);
  //this._solver.debugResponseToForceField(forces);
}
Rectangle.dragCorner = function(side1, side2, target1, target2, solver) {
  //console.log('dragcorner', side1, target1, side2, target2);
  //console.log('curr values', side1, this._side_vars[side1].get(),
  //                           side2, this._side_vars[side2].get());
  var Nside1 = this._ptsides[side1].size;
  var Nside2 = this._ptsides[side2].size;

  var forces = [{
    scalar: this._side_vars[side1],
    force:  Nside1 * (target1 - this._side_vars[side1].get()),
  },{
    scalar: this._side_vars[side2],
    force:  Nside2 * (target2 - this._side_vars[side2].get()),
  }];

  solver.solveForceField(forces);
  //this._solver.debugResponseToForceField(forces);
}

// BROWSER ONLY
if(!on_node) {
  Rectangle.hasSlider = function() {
    return !!this._handles;
  }
  Rectangle.clearSlider = function() {
    if(this.hasSlider()) {
      for(var k in this._handles) {
        rawdisplay.removeWidget(this._handles[k]);
      }
    }
    delete this._handles;
  }
  Rectangle.repositionSlider = function() {
    if(!this.hasSlider()) return;

    var box = this.getCurrSides();
    box.hc  = 0.5*(box.l + box.r);
    box.vc  = 0.5*(box.t + box.b);
    // for each handle, set the new coordinates
    this._handles.tl.resetAnchor({ anchor: [box.l,  box.t ], });
    this._handles.tc.resetAnchor({ anchor: [box.hc, box.t ], });
    this._handles.tr.resetAnchor({ anchor: [box.r,  box.t ], });
    this._handles.cl.resetAnchor({ anchor: [box.l,  box.vc], });
    //this._handles.cc.resetAnchor({ anchor: [box.hc, box.vc], });
    this._handles.cr.resetAnchor({ anchor: [box.r,  box.vc], });
    this._handles.bl.resetAnchor({ anchor: [box.l,  box.b ], });
    this._handles.bc.resetAnchor({ anchor: [box.hc, box.b ], });
    this._handles.br.resetAnchor({ anchor: [box.r,  box.b ], });
  }
  function gen_handle(anchor, workspace) {
    var handle = widgets.Handle.New({
      anchor: anchor, width:18, height:18,
      anchored_view: workspace,
      relative_pos: 'center', anchor_dist: 0,
      alpha: 0.7,
    });
    return handle;
  }
  function wire_handle(widget, the_doc, the_bureau,
                       hlabel, label1, coord1, label2, coord2)
  {
    var workspace = the_bureau.main_workspace;
    if(label2) {
      widget._handles[hlabel].onDragStart(function(newxy){
        newxy = workspace.xyinv(newxy);
        the_bureau.startAction(uiaction.DragRectangleHandleAction.New(
          the_doc, widget, label1, label2),
            { target1: newxy[coord1], target2: newxy[coord2] } );
      });
      widget._handles[hlabel].onDragMove(function(newxy) {
        newxy = workspace.xyinv(newxy);
        the_bureau.continueAction({
          target1: newxy[coord1], target2: newxy[coord2] });
      });
    } else {
      widget._handles[hlabel].onDragStart(function(newxy){
        newxy = workspace.xyinv(newxy);
        the_bureau.startAction(uiaction.DragRectangleHandleAction.New(
          the_doc, widget, label1, label2), { target: newxy[coord1] } );
      });
      widget._handles[hlabel].onDragMove(function(newxy) {
        newxy = workspace.xyinv(newxy);
        the_bureau.continueAction({ target: newxy[coord1] });
      });
    }
    widget._handles[hlabel].onDragEnd(function(){ the_bureau.endAction(); });
  }
  Rectangle.genSlider = function(the_doc, the_bureau) {
    console.log('gen rect slider');
    var widget = this;
    widget._handles = {};
    var workspace = the_bureau.main_workspace;

    var box = this.getCurrSides();
    box.hc  = 0.5*(box.l + box.r);
    box.vc  = 0.5*(box.t + box.b);
    // for each handle, determine the coordinates
    this._handles.tl = gen_handle([box.l,  box.t ], workspace);
    this._handles.tc = gen_handle([box.hc, box.t ], workspace);
    this._handles.tr = gen_handle([box.r,  box.t ], workspace);
    this._handles.cl = gen_handle([box.l,  box.vc], workspace);
    //this._handles.cc = gen_handle([box.hc, box.vc], workspace);
    this._handles.cr = gen_handle([box.r,  box.vc], workspace);
    this._handles.bl = gen_handle([box.l,  box.b ], workspace);
    this._handles.bc = gen_handle([box.hc, box.b ], workspace);
    this._handles.br = gen_handle([box.r,  box.b ], workspace);
    // add handles widgets to the display
    for(var k in this._handles)
      rawdisplay.addWidget(this._handles[k]);

    // wire up the callbacks for each of the 8 handles
    wire_handle(widget, the_doc, the_bureau, 'tl', 'l', 0, 't', 1);
    wire_handle(widget, the_doc, the_bureau, 'tc', 't', 1);
    wire_handle(widget, the_doc, the_bureau, 'tr', 'r', 0, 't', 1);
    wire_handle(widget, the_doc, the_bureau, 'cl', 'l', 0);
    // ---
    wire_handle(widget, the_doc, the_bureau, 'cr', 'r', 0);
    wire_handle(widget, the_doc, the_bureau, 'bl', 'l', 0, 'b', 1);
    wire_handle(widget, the_doc, the_bureau, 'bc', 'b', 1);
    wire_handle(widget, the_doc, the_bureau, 'br', 'r', 0, 'b', 1);
  }
}



})(typeof window === 'undefined');
