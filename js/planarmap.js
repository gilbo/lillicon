/*  
 *  planarmap.js
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
var exports = on_node? module.exports : window['planarmap']={};

// modules
if(on_node) {
  var primitives  = require('./primitives');
  var contours    = require('./contours');
} else {
  var primitives  = window.primitives;
  var contours    = window.contours;
  if(!primitives || !contours)
    throw new Error("Must have Primitives & Contours Modules "+
      "loaded before PMap");
}

var Contour = contours.Contour;
var Vec2    = primitives.Vec2;


var PlanarMap = (exports.PlanarMap = {});

// ASSUMPTIONS:
// contours enclose space according to the clockwise convention
// (because canvas coordinates with origin in top left are left handed)
// while points may be shared, the contours are non-intersecting (NOT CHECKED)
PlanarMap.New = function(cs) {
  // as a result, we don't really need a full featured planar map here...
  // we really just have black and white space
  if(!cs || !cs.length)
    throw new TypeError("PlanarMap.New() expects an array of Contours");

  for(var k=0; k<cs.length; k++)
    if(!Contour.isPrototypeOf(cs[k]))
      throw new TypeError(
        "the array arg to PlanarMap.New() must contain only Contours");

  var pmap = Object.create(PlanarMap);
  pmap._cs = cs.slice();
  return pmap;
}
PlanarMap.JSONSnapshot = function(auditor) {
  var cs = this._cs.map(auditor.receiveWith(function(c) {
    return c.JSONSnapshot(auditor);
  }));
  return { contours: cs };
}
PlanarMap.fromJSONSnapshot = function(pmap_snapshot, auditor) {
  var cs = pmap_snapshot.contours.map(auditor.dispenseWith(function(cjson) {
    return Contour.fromJSONSnapshot(cjson, auditor);
  }));
  var pmap = PlanarMap.New(cs);
  return pmap;
}

PlanarMap.forContours = function(f) {
  this._cs.forEach(f);
}
PlanarMap.mapContours = function(f) {
  return this._cs.map(f);
}

PlanarMap._point_set = function() {
  return this._cs.mapUnion(function(c) { return c._point_set(); });
}
PlanarMap._anchor_set = function() {
  return this._cs.mapUnion(function(c) { return c._anchor_set(); });
}

PlanarMap.getAllPoints = function() {
  return this._point_set().toArray();
}
PlanarMap.getAllAnchors = function() {
  return this._anchor_set().toArray();
}


PlanarMap.getBounds = function() {
  var minxy = [Infinity,Infinity];
  var maxxy = [-Infinity,-Infinity];
  function update(xy) {
    minxy[0] = Math.min(minxy[0], xy[0]);
    minxy[1] = Math.min(minxy[1], xy[1]);
    maxxy[0] = Math.max(maxxy[0], xy[0]);
    maxxy[1] = Math.max(maxxy[1], xy[1]);
  }

  this._cs.forEach(function(c) {
    c.segments().forEach(function(s) {
      update(s.a0().getxy());
      update(s.h0().getxy());
      update(s.h1().getxy());
    });
  });

  var wh = Vec2.sub(maxxy,minxy);
  return {
    l: minxy[0], t: minxy[1],
    r: maxxy[0], b: maxxy[1],
    w: wh[0], h: wh[1],
  };
}



PlanarMap.removeContour = function(plproxy) {
  // First find which contour it is
  for(var k=0; k<this._cs.length; k++) {
    this._cs[k].firstSeg().a0()._remove_contour_marker = this._cs[k];
  }

  // read out the contour we wanted
  var plpts = plproxy.points();
  var the_contour = null;
  for(var k=0; k<plpts.length; k++) {
    if(plpts[k]._remove_contour_marker) {
      the_contour = plpts[k]._remove_contour_marker;
      break;
    }
  }
  if(!the_contour) throw new Error('couldn\'t find the contour');

  // cleanup
  for(var k=0; k<this._cs.length; k++) {
    delete this._cs[k].firstSeg().a0()._remove_contour_marker;
  }

  // now, remove the contour and give us a new planar map
  var cs = this._cs.filter(function(c) { return c !== the_contour; });
  return PlanarMap.New(cs);
}







PlanarMap.draw = function(drawAPI) {
  drawAPI.beginPath();
  this._cs.forEach(function(c) {
    c.draw(drawAPI);
    drawAPI.closePath();
  });
}


if(typeof paper !== 'undefined') {
  PlanarMap.paper = function() {
    var paths = this._cs.map(function(c) { return c.paper(); });
    // unfortunately, gotta record and reset the clockwise data
    // after grouping into a compound path
    var clockwises = paths.map(function(p) { return p.clockwise; });
    // create compound path
    var compound = new paper.CompoundPath({
      children: paths,
      fillColor:'black',
    });
    for(var k=0; k<paths.length; k++) {
      paths[k].clockwise = clockwises[k];
    }
    return compound;
  }
}


// close the bezier paths...

})(typeof window === 'undefined');
