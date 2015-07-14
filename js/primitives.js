/*  
 *  primtives.js
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
var exports = on_node? module.exports : window['primitives']={};

// fix up built in Set here...
if(typeof Set === 'undefined')
  throw new Error('ECMAScript 6 Set is missing. '+
    'If you\'re on Node try running with option --harmony');
if(!Set.prototype.union) {
  Set.prototype.union = function(rhs) {
    if(Object.getPrototypeOf(rhs) !== Set.prototype)
      throw new TypeError('Must union a Set to a Set');
    var result = new Set(this);
    rhs.forEach(function(x) { result.add(x); });
    return result;
  }
}
if(!Set.prototype.symmDiff) {
  Set.prototype.symmDiff = function(rhs) {
    var lhs = this;
    if(Object.getPrototypeOf(rhs) !== Set.prototype)
      throw new TypeError(
        'Must take symmetric difference of a Set with a Set');
    var result = new Set(lhs);
    rhs.forEach(function(x) {
      if(lhs.has(x))  result.delete(x);
      else            result.add(x);
    });
    return result;
  }
}
if(!Set.prototype.filter) {
  Set.prototype.filter = function(func) {
    var result = new Set();
    this.forEach(function(x) { if(func(x)) result.add(x); });
    return result;
  }
}
if(!Array.prototype.mapUnion) {
  Array.prototype.mapUnion = function(f) {
    var result = new Set();
    this.forEach(function(x) {
      f(x).forEach(function(elem) { result.add(elem); });
    });
    return result;
  }
}
if(!Array.prototype.flatten) {
  Array.prototype.flatten = function() {
    return [].concat.apply([],this)
  }
}
if(!Array.prototype.flatmap) {
  Array.prototype.flatmap = function(f) {
    return this.map(f).flatten();
  }
}
if(!Set.prototype.toArray) {
  Set.prototype.toArray = function() {
    var r = [];
    this.forEach(function(x) { r.push(x); });
    return r;
  }
}



var Scalar = (exports.Scalar = {});
var Vec2   = (exports.Vec2   = {});
var Box2   = (exports.Box2   = {});



Scalar.New = function(initval) {
  initval = initval || 0;
  var s = Object.create(Scalar);
  s._val = initval;
  return s;
}
Scalar.set = function(val) {
  this._val = val;
}
Scalar.get = function(val) {
  return this._val;
}

Vec2.New = function(initval) {
  if(!initval || initval.length != 2) {
    initval = [0,0];
  } else {
    initval = initval.slice(); // safety!
  }
  if(!Scalar.isPrototypeOf(initval[0]))
    initval[0] = Scalar.New(initval[0]);
  if(!Scalar.isPrototypeOf(initval[1]))
    initval[1] = Scalar.New(initval[1]);

  var p = Object.create(Vec2);
  p._scalars = initval;
  return p;
}
Vec2.x = function() { return this._scalars[0]; }
Vec2.y = function() { return this._scalars[1]; }
Vec2.getxy = function() {
  return [ this._scalars[0].get(), this._scalars[1].get() ];
}
Vec2.getx = function() {
  return this._scalars[0].get();
}
Vec2.gety = function() {
  return this._scalars[1].get();
}

// helper functions for 2 element arrays
Vec2.add = function(a,b) {
  return [ a[0] + b[0], a[1] + b[1] ];
}
Vec2.sub = function(a,b) {
  return [ a[0] - b[0], a[1] - b[1] ];
}
Vec2.mul = function(a, v) {
  return [ a * v[0], a * v[1] ];
}
Vec2.dot = function(a,b) {
  return a[0]*b[0] + a[1]*b[1];
}
Vec2.cross = function(a,b) {
  return a[0]*b[1] - a[1]*b[0];
}
Vec2.area = function(a,b,c) {
  return (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
}
Vec2.len2 = function(a) {
  return a[0]*a[0] + a[1]*a[1];
}
Vec2.len = function(a) {
  return Math.sqrt(a[0]*a[0] + a[1]*a[1]);
}
Vec2.normalized = function(a) {
  return Vec2.mul( 1/Vec2.len(a), a );
}

Vec2.max = function(a,b) {
  return [ Math.max(a[0],b[0]), Math.max(a[1],b[1]) ];
}
Vec2.min = function(a,b) {
  return [ Math.min(a[0],b[0]), Math.min(a[1],b[1]) ];
}

if(typeof paper !== 'undefined') {
  Vec2.paper = function() {
    return new paper.Point(this._scalars[0].get(), this._scalars[1].get());
  }
}


Box2.wh = function(a) {
  return Vec2.sub(a[1],a[0]);
}
Box2.makeEmpty = function() {
  return [[Infinity,Infinity],[-Infinity,-Infinity]];
}
Box2.fromVec = function(v) {
  return [v,v];
}
Box2.from2Vecs = function(a,b) {
  return [ Vec2.min(a,b), Vec2.max(a,b) ];
}
Box2.isEmpty = function(a, eps) {
  eps = eps || 0;
  var wh = Box2.wh(a);
  return wh[0] <= eps || wh[1] <= eps;
}
Box2.convex = function(a,b) {
  return [ Vec2.min(a[0],b[0]), Vec2.max(a[1],b[1]) ];
}
Box2.isct = function(a,b) {
  return [ Vec2.max(a[0],b[0]), Vec2.min(a[1],b[1]) ];
}
Box2.isIsct = function(a,b,eps) {
  return !Box2.isEmpty(Box2.isct(a,b), eps);
}
Box2.inBox = function(box,vec,eps) {
  eps = eps || 0;
  var tomin = Vec2.sub(vec,box[0]);
  if(tomin[0] <= -eps || tomin[1] <= -eps) return false;
  var tomax = Vec2.sub(box[1],vec);
  if(tomax[0] <= -eps || tomax[1] <= -eps) return false;
  return true;
}




})(typeof window === 'undefined');
