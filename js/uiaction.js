/*  
 *  uiaction.js
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
var exports = on_node? module.exports : window['uiaction']={};

// modules
if(on_node) {
//  var primitives  = require('./primitives');
//  var contours    = require('./contours');
//  var planarmap   = require('./planarmap');
//  var constraints = require('./constraints');
//  var numeric_subroutines = require('./numeric_subroutines');
} else {
//  var primitives  = window.primitives;
//  var contours    = window.contours;
//  var planarmap   = window.planarmap;
//  var constraints = window.constraints;
//  var numeric_subroutines = window.numeric_subroutines;
//  if(!primitives || !contours || !planarmap ||
//     !constraints || !numeric_subroutines)
//    throw new Error(
//      "Must have Primitives, Contours, PlanarMap, Constraints, & "+
//      "Numeric Subroutines Modules loaded before UIAction");
}


// IMPORTS





// DECLARATIONS
var UIAction                    = {};
var InstantaneousAction         = Object.create(UIAction);
var OngoingAction               = Object.create(UIAction);

var DeleteAction                = Object.create(InstantaneousAction);
var GrabDragAction              = Object.create(OngoingAction);
var BezierDragAction            = Object.create(OngoingAction);
var InterpretModeAction         = Object.create(InstantaneousAction);
var SelectAction                = Object.create(OngoingAction);
var BezierSelectAction          = Object.create(OngoingAction);
var BezierPointSelectAction     = Object.create(InstantaneousAction);
var AddToMultiSelectAction      = Object.create(InstantaneousAction);
var ClearMultiSelectAction      = Object.create(InstantaneousAction);
var DragBlobWidthAction         = Object.create(OngoingAction);
var DragStrokeWidthAction       = Object.create(OngoingAction);
var DragRectangleHandleAction   = Object.create(OngoingAction);
exports.DeleteAction            = DeleteAction;
exports.GrabDragAction          = GrabDragAction;
exports.BezierDragAction        = BezierDragAction;
exports.InterpretModeAction     = InterpretModeAction;
exports.SelectAction            = SelectAction;
exports.BezierSelectAction      = BezierSelectAction;
exports.BezierPointSelectAction = BezierPointSelectAction;
exports.AddToMultiSelectAction  = AddToMultiSelectAction;
exports.ClearMultiSelectAction  = ClearMultiSelectAction;
exports.DragBlobWidthAction     = DragBlobWidthAction;
exports.DragStrokeWidthAction   = DragStrokeWidthAction;
exports.DragRectangleHandleAction = DragRectangleHandleAction;

UIAction.redo = function() { throw new Error('redo unimplemented'); };
InstantaneousAction.donow = function() {
  throw new Error('donow unimplemented'); };
OngoingAction.dostart = function(params) {
  throw new Error('dostart unimplemented'); };
OngoingAction.docontinue = function(params) {
  throw new Error('dostart unimplemented'); };
OngoingAction.doend = function(params) {
  throw new Error('dostart unimplemented'); };


// UNIVERSAL UNDO
UIAction.saveForUndo = function() {
  this._prev_doc = this.doc.JSONSnapshot();
}
UIAction.undo = function() {
  if(this._prev_doc)
    this.doc.restoreFromJSONSnapshot(this._prev_doc);
  delete this._prev_doc;
}

// IMPLEMENTATIONS
DeleteAction.New = function(doc) {
  var act = Object.create(DeleteAction);
  act.doc = doc;
  return act;
}
DeleteAction.donow = function() {
  // safety guard
  if(!this.doc.select.isBlob() && !this.doc.select.isStroke()) return;

  this.saveForUndo();

  var loops = this.doc.select.getLoops();
  console.log('loops', loops);

  var closed_loops = [];
  var splicing_loops = [];
  for(var k=0; k<loops.length; k++) {
    if(loops[k].length === 1 && loops[k][0].isClosed())
      closed_loops.push(loops[k][0]);
    else
      splicing_loops.push(loops[k]);
  }
  if(splicing_loops.length > 1) {
    throw new Error('CANNOT SUPPORT multiple loops being spliced at once');
  }

  var pmap = this.doc.pmap;
  if(splicing_loops.length === 1) {
    // get gaps
    var loop = splicing_loops[0];
    var gaps = [];
    var lastpt = loop[loop.length-1].end();
    for(var k=0; k<loop.length; k++) {
      gaps.push([loop[k].start(), lastpt]);
      lastpt = loop[k].end();
    }

    pmap = this.doc.analyzer.spliceLoop(gaps);
  }
  for(var k=0; k<closed_loops.length; k++) {
    pmap = pmap.removeContour(closed_loops[k]);
  }
  this.doc.reInit(pmap);

  // Logging
  return 'DELETE';
}



GrabDragAction.New = function(doc, grabpt) {
  var act = Object.create(GrabDragAction);
  act.doc = doc;
  act.grabpt = grabpt;
  return act;
}
GrabDragAction.dostart = function(params) {
  this.saveForUndo();
  // Logging
  this.start_pos = this.grabpt.getxy();
  return 'START_GRAB_DRAG';
}
GrabDragAction.docontinue = function(params) {
  var x = params.x;
  var y = params.y;
  var d_grab = [
    x - this.grabpt.x().get(),
    y - this.grabpt.y().get(),
  ];
  var forces = [];
  if(this.doc.select.isEmpty()) {
    forces.push({ scalar: this.grabpt.x(),  force: d_grab[0] });
    forces.push({ scalar: this.grabpt.y(),  force: d_grab[1] });
  } else {
    this.doc.select.points().forEach(function(pt) {
      forces.push({ scalar: pt.x(), force: d_grab[0] });
      forces.push({ scalar: pt.y(), force: d_grab[1] });
    });
  }
  this.doc.slv.solveForceField(forces);
  //this.doc.slv.debugResponseToForceField(forces);

  // TODO: CAN WE KILL THIS SOMEHOW?
  this.doc.select.repositionSlider(); // safe to call whenever

  //Logging
}
GrabDragAction.doend = function(params) {
  // Logging
  this.end_pos = this.grabpt.getxy();
  return 'END_GRAB_DRAG';
};



BezierDragAction.New = function(doc, grabxy, handle) {
  var act = Object.create(BezierDragAction);
  act.doc = doc;
  act.curr_pos  = grabxy.slice();
  this.handle = handle;
  return act;
}
BezierDragAction.dostart = function(params) {
  this.saveForUndo();
  // Logging
  this.start_pos = this.curr_pos.slice();
  return 'START_GRAB_DRAG';
}
BezierDragAction.docontinue = function(params) {
  var x = params.x;
  var y = params.y;
  var xy = [x,y];
  var dxy = Vec2.sub(xy, this.curr_pos);

  // if this was a drag action on a handle, then
  if(this.handle) {
    // ...
  }
  // otherwise, we're dragging the anchors around
  else {
    this.doc.translateBezierAnchorsBy(dxy);
  }

  this.curr_pos = xy;

  //Logging
}
BezierDragAction.doend = function(params) {
  // Logging
  this.end_pos = this.curr_pos.slice();
  return 'END_GRAB_DRAG';
};



InterpretModeAction.New = function(doc) {
  var act = Object.create(InterpretModeAction);
  act.doc = doc;
  return act;
}
InterpretModeAction.donow = function(params) {
  // don't worry about pushing this on the undo stack
  this.doc.setInterpretationFilter(params.mode);
  var modestr = params.mode;
  if(!modestr) modestr = 'all';
  return 'SET_INTERPRETATION '+modestr.toUpperCase();
}



SelectAction.New = function(doc, bureau) {
  var act = Object.create(SelectAction);
  act.doc = doc;
  act.bureau = bureau;
  return act;
}
// This action doesn't go on the undo stack, because of this null value
SelectAction.undo = null;
SelectAction.dostart = function(select_params) {
  this.doc.openSelectionProposal(select_params);
  // Logging
  return 'START_SELECTION';
}
SelectAction.docontinue = function(select_params) {
  this.doc.updateSelectionProposal(select_params);
  // Logging
}
SelectAction.doend = function() {
  this.doc.closeSelectionProposal();
  if(this.doc.select.isBlob() ||
     this.doc.select.isStroke() ||
     this.doc.select.isRectangle())
  {
    this.doc.select.genSlider(this.doc, this.bureau);
  }
  // Logging
  return 'END_SELECTION';
}



BezierPointSelectAction.New = function(doc, clicked_pt) {
  var act = Object.create(BezierPointSelectAction);
  act.doc = doc;
  act.pt  = clicked_pt;
  return act;
}
// This action doesn't go on the undo stack, because of this null value
BezierPointSelectAction.undo = null;
BezierPointSelectAction.donow = function(params) {
  this.doc.selectSingleBezierPoint(this.pt);
  // Logging
  return 'BEZIER_SINGLE_POINT_SELECT';
}

BezierSelectAction.New = function(doc, clicked_pt, cutoff, bureau) {
  var act = Object.create(BezierSelectAction);
  act.doc         = doc;
  act.clicked_pt  = clicked_pt;
  act.cutoff      = cutoff;
  return act;
}
// This action doesn't go on the undo stack, because of this null value
BezierSelectAction.undo = null;
BezierSelectAction.dostart = function(select_params) {
  this.doc.openBezierProposal(select_params, this.clicked_pt, this.cutoff);
  // Logging
  return 'START_BEZIER_SELECTION';
}
BezierSelectAction.docontinue = function(select_params) {
  this.doc.updateBezierProposal(select_params, this.clicked_pt, this.cutoff);
  // Logging
}
BezierSelectAction.doend = function() {
  this.doc.closeBezierProposal();
  // Logging
  return 'END_BEZIER_SELECTION';
}



AddToMultiSelectAction.New = function(doc) {
  var act = Object.create(AddToMultiSelectAction);
  act.doc = doc;
  return act;
}
AddToMultiSelectAction.undo = null;
AddToMultiSelectAction.donow = function(params) {
  // don't worry about pushing this on the undo stack
  this.doc.addCurrentToMultiSelection();
  return 'ADD_TO_MULTISELECT '+modestr.toUpperCase();
}

ClearMultiSelectAction.New = function(doc) {
  var act = Object.create(ClearMultiSelectAction);
  act.doc = doc;
  return act;
}
ClearMultiSelectAction.undo = null;
ClearMultiSelectAction.donow = function(params) {
  // don't worry about pushing this on the undo stack
  this.doc.clearMultiSelection();
  return 'CLEAR_MULTISELECT '+modestr.toUpperCase();
}



DragBlobWidthAction.New = function(doc, blob) {
  var act = Object.create(DragBlobWidthAction);
  act.doc = doc;
  act.blob = blob;
  return act;
}
DragBlobWidthAction.dostart = function(params) {
  this.saveForUndo();
  this.blob.dragRadius(params.target_radius, this.doc.slv);
  // Logging
  return 'START_DRAG_BLOB_WIDTH';
}
DragBlobWidthAction.docontinue = function(params) {
  this.blob.dragRadius(params.target_radius, this.doc.slv);
}
DragBlobWidthAction.doend = function(params) {
  // Logging
  return 'END_DRAG_BLOB_WIDTH';
}

DragStrokeWidthAction.New = function(doc, stroke) {
  var act = Object.create(DragStrokeWidthAction);
  act.doc = doc;
  act.stroke = stroke;
  return act;
}
DragStrokeWidthAction.dostart = function(params) {
  this.saveForUndo();
  this.stroke.dragWidth(params.target_width, this.doc.slv);
  // Logging
  return 'START_DRAG_STROKE_WIDTH';
}
DragStrokeWidthAction.docontinue = function(params) {
  this.stroke.dragWidth(params.target_width, this.doc.slv);
}
DragStrokeWidthAction.doend = function(params) {
  // Logging
  return 'END_DRAG_STROKE_WIDTH';
}

DragRectangleHandleAction.New = function(doc, rectwidget, side1, side2) {
  var act = Object.create(DragRectangleHandleAction);
  act.doc = doc;
  act.rectwidget = rectwidget;
  act.side1 = side1;
  act.side2 = side2;
  return act;
}
DragRectangleHandleAction.dostart = function(params) {
  this.saveForUndo();

  if(this.side2)
    this.rectwidget.dragCorner(this.side1, this.side2,
                               params.target1, params.target2, this.doc.slv);
  else
    this.rectwidget.dragSide(this.side1, params.target, this.doc.slv);
  this.rectwidget.repositionSlider(); // safe to call whenever
  // Logging

  return 'START_DRAG_STROKE_WIDTH';
}
DragRectangleHandleAction.docontinue = function(params) {
  if(this.side2)
    this.rectwidget.dragCorner(this.side1, this.side2,
                               params.target1, params.target2, this.doc.slv);
  else
    this.rectwidget.dragSide(this.side1, params.target, this.doc.slv);
  this.rectwidget.repositionSlider(); // safe to call whenever
}
DragRectangleHandleAction.doend = function(params) {
  // Logging
  return 'END_DRAG_STROKE_WIDTH';
}














})(typeof window === 'undefined');
