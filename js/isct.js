'use strict';
/*  
 *  isct.js
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
var exports = on_node? module.exports : window['isct']={};

// modules
if(on_node) {
  var primitives  = require('./primitives');
} else {
  var primitives  = window.primitives;
  if(!primitives)
    throw new Error("Must have Primitives Module loaded before Isct");
}


var Box2  = primitives.Box2;


var AABVH   = (exports.AABVH = {});

var Leaf    = Object.create(AABVH);
var Branch  = Object.create(AABVH);


function bound_objs(objs) {
  var box = Box2.makeEmpty();
  for(var k=0; k<objs.length; k++)
    box = Box2.convex( box, objs[k].box );
  return box;
}
function quickswap(objs,i,j) {
  var tmp = objs[i];
  objs[i] = objs[j];
  objs[j] = tmp;
}
// copied from wikipedia
function quickpartition(objs,coord,left,right, pivotindex) {
  var pivot = objs[pivotindex].center[coord];
  quickswap(objs, pivotindex, right);
  var write = left;
  for(var i=left; i<right; i++) {
    if(objs[i].center[coord] < pivot) {
      quickswap(objs, write, i);
      write++;
    }
  }
  quickswap(objs, write, right); // wright?
  return write;
}
function quickselect(objs,coord,left,right, n) {
  while(true) {
    if(left === right)
      return;

    var pivotindex = left + Math.floor(Math.random() * (right-left + 1));
    pivotindex = quickpartition(objs,coord,left,right, pivotindex);

    if(n === pivotindex)
      return;
    else if(n < pivotindex)
      right = pivotindex - 1;
    else
      left = pivotindex + 1;
  }
}
function split_objs(objs) {
  var bdwh = Box2.wh(bound_objs(objs));
  var N = objs.length;
  var N2 = Math.floor(N/2);

  if(bdwh[0] > bdwh[1]) { // xaxis longer, so split along it
    quickselect(objs,0, 0,N-1, N2);
  }
  else { // yaxis longer, so split along it
    quickselect(objs,1, 0,N-1, N2);
  }

  var left = objs.slice(0,N2);
  var right = objs.slice(N2);
  return [left,right];
}

function recurse_build(objs, params) {
  if(objs.length < params.leaf_cutoff) {
    var node = Object.create(Leaf);
    node.objs = objs;
    node.box = bound_objs(objs);
    return node;
  }

  // otherwise, split
  var halves = split_objs(objs);

  var node = Object.create(Branch);
  node.left = recurse_build(halves[0], params);
  node.right = recurse_build(halves[1], params);
  node.box = Box2.convex( node.left.box, node.right.box );
  return node;
}

AABVH.New   = function(objs, params) {
  if(objs.length < 1) throw new Error('cannot build AABVH out of nothing');
  // expand objects
  objs = objs.map(function(o) {
    return {
      obj: o,
      box: params.bbox(o),
      center: params.center(o),
    };
  });

  return recurse_build(objs, params);
}

Branch.doIsct = function(box, clbk, eps) {
  eps = eps || 0;
  if(!Box2.isIsct(this.box, box, -eps)) return;
  this.left.doIsct(box,clbk,eps);
  this.right.doIsct(box,clbk,eps);
}
Leaf.doIsct = function(box, clbk, eps) {
  eps = eps || 0;
  if(!Box2.isIsct(this.box, box, -eps)) return;

  for(var k=0; k<this.objs.length; k++) {
    if(Box2.isIsct(this.objs[k].box, box, -eps)) {
      clbk(this.objs[k].obj);
    }
  }
}























})(typeof window === 'undefined');
