/*  
 *  docstate.js
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
var exports = on_node? module.exports : window['docstate']={};

// modules
if(on_node) {
  var analysis    = require('./analysis');
  var solver      = require('./solver');
  var selections  = require('./selections');
  var primitives  = require('./primitives');
//  var contours    = require('./contours');
  var planarmap   = require('./planarmap');
//  var constraints = require('./constraints');
//  var numeric_subroutines = require('./numeric_subroutines');
} else {
  var analysis    = window.analysis;
  var solver      = window.solver;
  var selections  = window.selections;
  var primitives  = window.primitives;
//  var contours    = window.contours;
  var planarmap   = window.planarmap;
//  var constraints = window.constraints;
//  var numeric_subroutines = window.numeric_subroutines;
  if(!analysis || !solver || !selections || !primitives || !planarmap)
    throw new Error("Must have Analysis, Solver, Selections, "+
      "Primitives, & PlanarMap Modules loaded before DocState");
}


// IMPORTS
var Analysis    = analysis.Analysis;
var Solver      = solver.Solver;
var Selection   = selections.Selection;
var Proposal    = selections.Proposal;

var Vec2        = primitives.Vec2;
var PlanarMap   = planarmap.PlanarMap;


// DECLARATIONS
var DocState = (exports.DocState = {});

// for snapshotting
var Auditor = {}; // don't expose







// IMPLEMENTATIONS
DocState.InitNew = function(pmap) {
  var doc = Object.create(DocState);
  doc.select = Selection.New(); // prevent errors
  doc._bezier_selection = new Set();
  doc.reInit(pmap)
  return doc;
}

DocState.reInit = function(pmap) {
  var analyzer      = Analysis.NewFromDensity(pmap, 100);
      analyzer.analyze();
  this.reInitPreAnalyzed(pmap, analyzer);
}
// following factoring out is useful for undo functionality right now
DocState.reInitPreAnalyzed = function(pmap, analyzer) {
  this.pmap         = pmap;
  this.analyzer     = analyzer;

  this.analyzer.buildConstraints();

  this.polygons     = this.analyzer.polygons();
  this.polypoints   = this.analyzer.polygonPoints();
  this.circles      = this.analyzer.circles();

  this.clearMultiSelection();
  this.resetSelection();
  this.resetSolver();
}

DocState.resetSolver = function() {
  var solver = this.slv;
  if(solver)  solver.clear();
  else        solver = (this.slv = Solver.New());

  solver.addConstraints(this.analyzer.constraints());
  if(this.select.isNonTrivial()) {
    solver.addConstraints(this.select.constraints());
  }
  this.multi_select.forEach(function(select) {
    solver.addConstraints(select);
  })
}

// managing selections
DocState.resetSelection = function() {
  var old_select = this.select;
  this.select   = Selection.New();
  if(old_select.isNonTrivial()) {
    old_select.clearSlider();
    this.resetSolver();
  }
}
DocState.setSelection = function(sel) {
  this.resetSelection(); // to be safe
  this.select = sel;
  if(this.select.isNonTrivial()) {
    this.select.analyze();
    this.resetSolver();
  }
}

// managing multi-selections
DocState.clearMultiSelection = function() {
  // NEED TO SAFELY REMOVE SELECTIONS? (seems the answer is no)
  this.multi_select = [];
}
DocState.addCurrentToMultiSelection = function() {
  if(this.select.isNonTrivial()) {
    this.multi_select.push(this.select);
    this.resetSelection();
  }
}

// managing selection proposals
DocState.hasOpenProposal = function() { return !!this.proposal; }
DocState.openSelectionProposal = function(select_obj) {
  this.select.clearSlider();
  this.proposal = Proposal.New(this.select, select_obj.invert);
}
DocState.updateSelectionProposal = function(select_obj) {
  if(!this.hasOpenProposal())
    throw new Error('Cannot update non-existant proposal');
  if(this._interpretation_filter === 'rectangle')
    this.proposal.annulus(this.polypoints, select_obj.rect,
                          this._select_annulus_w());
  else
    this.proposal.marquee(this.polypoints, select_obj.rect);
}
DocState.closeSelectionProposal = function() {
  if(!this.hasOpenProposal())
    throw new Error('Cannot update non-existant proposal');
  //if(this._interpretation_filter === 'rectangle')
  //  this.setSelection(Selection.New(this.proposal.points()));
  //else
    this.setSelection(this.proposal.commitSelection(
      this.polygons,
      this._interpretation_filter
    ));
  delete this.proposal;
}

DocState.setSelectAnnulusWidthCallback = function(clbk) {
  this._select_annulus_w = clbk;
}
DocState.getSelectAnnulusWidth = function() {
  return this._select_annulus_w();
}


// define 
DocState.setInterpretationFilter = function(value) {
  this._interpretation_filter = value;
}



// useful point sets
DocState.selectOrProposePoints = function() {
  return (this.proposal)? this.proposal.points() : this.select.points() ;
}
DocState.grabdraggablePoints = function() {
  return (this.select.isEmpty())? this.polypoints : this.select.points() ;
}





// Bezier Selection Stuff
DocState.refreshAnchorSet = function() {
  this._anchor_set = this.pmap._anchor_set();
}
DocState.anchorSet = function() {
  this.refreshAnchorSet();
  return this._anchor_set;
}

DocState._compute_bz_proposal = function(select_obj, clicked_pt, cutoff) {
  var selection = this._bezier_selection;
  var indicated_set;

  var rect = select_obj.rect;
  var linf_dist = Math.max(rect.r-rect.l, rect.b-rect.t);
  //var diff = Vec2.sub(closest_point.getxy(), xy);
  //var linf_dist = Math.max(Math.abs(diff[0]), Math.abs(diff[1]));
  if(linf_dist < cutoff && clicked_pt) {
    indicated_set = new Set([clicked_pt]);
  } else {
    indicated_set = this._anchor_set.filter(function(pt) {
      var xy = pt.getxy();
      return xy[0] >= rect.l && xy[0] <= rect.r &&
             xy[1] >= rect.t && xy[1] <= rect.b ;
    });
  }

  if(selection && select_obj.invert) {
    return selection.symmDiff(indicated_set);
  } else {
    return indicated_set;
  }
}
function clear_bz_selection_markers(selection) {
  selection.forEach(function(pt) {
    delete pt.is_bezier_selected;
  });
}
function set_bz_selection_markers(selection) {
  selection.forEach(function(pt) {
    pt.is_bezier_selected = true;
  })
}

DocState.hasBezierProposal = function() { return !!this._bezier_proposal; }
DocState.openBezierProposal = function(select_obj, clicked_pt, cutoff) {
  clear_bz_selection_markers(this._bezier_selection);
  this._bezier_proposal = this._compute_bz_proposal(
    select_obj, clicked_pt, cutoff
  );
  set_bz_selection_markers(this._bezier_proposal);
}
DocState.updateBezierProposal = function(select_obj, clicked_pt, cutoff) {
  if(!this.hasBezierProposal())
    throw new Error('Cannot update non-existant Bezier proposal');

  clear_bz_selection_markers(this._bezier_proposal);
  this._bezier_proposal = this._compute_bz_proposal(
    select_obj, clicked_pt, cutoff
  );
  set_bz_selection_markers(this._bezier_proposal);
}
DocState.closeBezierProposal = function() {
  if(!this.hasBezierProposal())
    throw new Error('Cannot update non-existant Bezier proposal');

  this._bezier_selection = this._bezier_proposal;
  delete this._bezier_proposal;
}
DocState.selectSingleBezierPoint = function(pt) {
  if(this.hasBezierProposal())
    throw new Error('Cannot select single Bezier point while proposal open');

  clear_bz_selection_markers(this._bezier_selection);
  this._bezier_selection = new Set([pt]);
  set_bz_selection_markers(this._bezier_selection);
}

function simple_move(pt, dxy) {
  var newxy = Vec2.add(pt.getxy(), dxy);
  pt.x().set(newxy[0]);
  pt.y().set(newxy[1]);
}
DocState.translateBezierAnchorsBy = function(dxy) {
  // move all anchors and attached handles...?
  var arcs_moved = new Set();
  this.pmap.forContours(function(c) {
    var segs = c.segments();
    for(var si=0; si<segs.length; si++) {
      var curr = segs[si];
      var prev = segs[(si)? si-1 : segs.length-1];
      var anchor = curr.a0();
      if(!anchor.is_bezier_selected) continue;

      // move anchor
      simple_move(anchor, dxy);
      // move handles attached to anchor
      if(prev.isBezier()) {
        simple_move(prev.h1(), dxy);
      } else {
        arcs_moved.add(prev);
      }
      if(curr.isBezier()) {
        simple_move(curr.h0(), dxy);
      } else {
        arcs_moved.add(curr);
      }
    }
  });

  // now fix up the arcs that got an anchor moved
  arcs_moved.forEach(function(arc) {
    var a0 = arc.a0().getxy();
    var h  = Vec2.add( arc.h().getxy(), dxy );
    var a1 = arc.a1().getxy();

    var e     = Vec2.sub(a1,a0);
    var elen2 = Vec2.len2(e);
    var ah0   = Vec2.sub(h,a0);
    //var ah1   = Vec2.sub(h,a1);
    var proj0 = Vec2.mul( Vec2.dot(ah0,e)/elen2, e );
    var perp  = Vec2.sub( ah0, proj0 );
    var mid   = Vec2.mul(0.5, Vec2.add(a0, a1));
        h     = Vec2.add(mid, perp);

    var p1 = arc.h();
    p1.x().set(h[0]);
    p1.y().set(h[1]);
    arc.setWfromH();
  })
}








Auditor.NewReceiver = function() {
  var aud = Object.create(Auditor);
  aud._json_store = [];
  aud._obj_store = [];
  return aud;
}
Auditor.NewDispenser = function(json_obj_cache) {
  var aud = Object.create(Auditor);
  aud._json_store = json_obj_cache.slice();
  for(var k=0; k<aud._json_store.length; k++)
    if(aud._json_store[k] === undefined) console.log('k undef', k);
  aud._obj_store  = [];
  return aud;
}
Auditor.receiveWith = function(serialize) {
  var aud = this;
  return function(obj) {
    if(obj._auditor_receipt_id === undefined) {
      var json = serialize(obj);

      var id = aud._json_store.length;
      obj._auditor_receipt_id = id;
      aud._json_store.push(json);
      aud._obj_store.push(obj);
    }
    return obj._auditor_receipt_id;
  };
}
Auditor.dispenseWith = function(deserialize) {
  var aud = this;
  return function(id) {
    var obj = aud._obj_store[id];
    if(obj === undefined) {
      if(id < 0 || id >= aud._json_store.length)
        throw new Error('receipt out of bounds, cannot dispense object');

      var json = aud._json_store[id];
      obj = (aud._obj_store[id] = deserialize(json));
    }
    return obj;
  }
}
Auditor.getJSONCache = function() {
  return this._json_store.slice();
}
Auditor.cleanup = function() {
  this._obj_store.forEach(function(obj) {
    delete obj._auditor_receipt_id;
  });
  this._obj_store = [];
  this._json_store = [];
}



// convert the current state into a JSON object that can be
// stored or serialized and is sufficient to reconstruct the
// DocState exactly
DocState.JSONSnapshot = function() {
  if(this.hasOpenProposal())
    throw new Error("Cannot snapshot DocState while a proposal is open");

  var auditor = Auditor.NewReceiver();

  // snapshot various bits of the state
  var pmap_snapshot = auditor.receiveWith(function(pmap) {
    return pmap.JSONSnapshot(auditor);
  })(this.pmap);
  var analyzer_snapshot = auditor.receiveWith(function(analyzer) {
    return analyzer.JSONSnapshot(auditor);
  })(this.analyzer);

  var audited_objects = auditor.getJSONCache();
  auditor.cleanup();
  return {
    objects:  audited_objects,
    pmap:     pmap_snapshot,
    analyzer: analyzer_snapshot,
  };

  // We would also like to capture the analysis object
  // and we would like to capture the selection
  // However, in the interest of making progress quickly, we'll postpone
  // both of those
}
DocState.restoreFromJSONSnapshot = function(snapshot) {
  var auditor = Auditor.NewDispenser(snapshot.objects);
  //var time0 = performance.now();
  var pmap = auditor.dispenseWith(function(pmapsnap) {
    return PlanarMap.fromJSONSnapshot(pmapsnap, auditor);
  })(snapshot.pmap);
  var analyzer = auditor.dispenseWith(function(asnap) {
    return Analysis.fromJSONSnapshot(asnap, auditor);
  })(snapshot.analyzer);
  //var time1 = performance.now();
  //console.log('deserialize in ms', time1 - time0);

  this.reInitPreAnalyzed(pmap, analyzer);
  //this.reInit(pmap);
}








})(typeof window === 'undefined');
