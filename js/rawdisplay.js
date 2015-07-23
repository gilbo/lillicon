/*  
 *  rawdisplay.js
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
if(on_node) throw new Error("Cannot Load RawDisplay Module in Node");
var exports = (window['rawdisplay']={});

if(typeof jQuery === 'undefined') {
  throw new Error("Cannot Load Display Module w/o jQuery loaded");
}


function pxstr_to_num(str) {
  var N = str.length;
  // TODO: Remove the following line eventually?
  if(str[N-2] !== 'p' || str[N-1] !== 'x') throw new Error('DEBUG PXSTR FAIL');
  return Number(str.substr(0,N-2));
}
function is_num(val) { return typeof(val) === 'number' }


// global display values
var canvas;
var ctxt;
var canvasW = 1200;
var canvasH = 700;
var canvasWoverH = 12.0/7.0;
//var MARGIN = 10;
//var boxes = [256, 192, 128, 64, 32];

exports.width = function() { return canvasW; }
exports.height = function() { return canvasH; }
exports.aspect = function() { return canvasWoverH; }


var Rect = {};
exports._Rect = Rect;
Rect.New = function(blob) {
  var r = Object.create(Rect);
  blob = blob || {};

  r.l = is_num(blob.l) ? blob.l : blob.x;
  r.r = blob.r;
  r.w = blob.w;
  var l_valid = is_num(r.l);
  var r_valid = is_num(r.r);
  var w_valid = is_num(r.w);

  r.t = is_num(blob.t) ? blob.t : blob.y;
  r.b = blob.b;
  r.h = blob.h;
  var t_valid = is_num(r.t);
  var b_valid = is_num(r.b);
  var h_valid = is_num(r.h);

  var lrw_count = (l_valid ? 1:0) + (r_valid ? 1:0) + (w_valid ? 1:0);
  if(lrw_count === 3) {
    r.w = r.r - r.l;
  } else if(lrw_count === 2) {
         if(!l_valid)   r.l = r.r - r.w;
    else if(!r_valid)   r.r = r.l + r.w;
    else                r.w = r.r - r.l;
  } else {
    throw new Error("Invalid Rect Args: "+
                    "must supply 2 of 3 params: l, w, r ");
  }

  var tbh_count = (l_valid ? 1:0) + (r_valid ? 1:0) + (w_valid ? 1:0);
  if(tbh_count === 3) {
    r.h = r.b - r.t;
  } else if(tbh_count === 2) {
         if(!t_valid)   r.t = r.b - r.h;
    else if(!b_valid)   r.b = r.t + r.h;
    else                r.h = r.b - r.t;
  } else {
    throw new Error("Invalid Rect Args: "+
                    "must supply 2 of 3 params: t, b, h ");
  }

  return r;
}
Rect.clone = function() {
  var r = Object.create(Rect);
  r.l = this.l;
  r.r = this.r;
  r.t = this.t;
  r.b = this.b;
  r.w = this.w;
  r.h = this.h;
  return r;
}
Rect.center = function() {
  return [ 0.5*(this.l + this.r), 0.5*(this.t + this.b) ];
}
Rect.translateBy = function(dx,dy) {
  this.l += dx;
  this.r += dx;
  this.t += dy;
  this.b += dy;
}
Rect.scaleFromCenterBy = function(mult) {
  this.setWidthHeightFromCenterTo(this.w * mult, this.h * mult);
}
Rect.setWidthHeightFromCenterTo = function(w,h) {
  var c = this.center();
  this.w = w;
  this.h = h;
  this.l = c[0] - 0.5*w;
  this.r = c[0] + 0.5*w;
  this.t = c[1] - 0.5*h;
  this.b = c[1] + 0.5*h;
}
Rect.contains = function(x,y) {
  return this.l <= x && x < this.r &&
         this.t <= y && y < this.b ;
}


var UniformTransform = {};
UniformTransform.New = function() {
  var transform = Object.create(UniformTransform);
  transform._x_offset   = 0;
  transform._y_offset   = 0;
  transform._scale      = 1;
  transform._scale_inv  = 1;
  return transform;
}
UniformTransform.scale = function() { return this._scale; }
UniformTransform.x = function(xval) {
  return this._scale * xval + this._x_offset;
}
UniformTransform.y = function(yval) {
  return this._scale * yval + this._y_offset;
}
UniformTransform.xy = function(xyvals) {
  return [ this.x(xyvals[0]), this.y(xyvals[1]) ];
}
UniformTransform.dx = function(dxval) {
  return this._scale * dxval;
}
UniformTransform.dy = function(dyval) {
  return this._scale * dyval;
}
UniformTransform.xinv = function(xval) {
  return this._scale_inv * ( xval - this._x_offset );
}
UniformTransform.yinv = function(yval) {
  return this._scale_inv * ( yval - this._y_offset );
}
UniformTransform.xyinv = function(xyvals) {
  return [ this.xinv(xyvals[0]), this.yinv(xyvals[1]) ];
}
UniformTransform.dxinv = function(dxval) {
  return this._scale_inv * dxval;
}
UniformTransform.dyinv = function(dyval) {
  return this._scale_inv * dyval;
}


var Viewport = Object.create(UniformTransform);
exports._Viewport = Viewport;
Viewport._initialize = function(opts) {
  opts = opts || {};
  this._transform_listeners = [];

  this._viewrect = Rect.New({l:0,t:0,w:1,h:1}); // spoof to prevent error
  this.setPxRect(opts.pxrect);
  if(opts.viewrect) this.setViewRect(opts.viewrect);

  this._px_margin = opts.px_margin || 0;
  var worldbounds = opts.worldbounds || this._viewrect;
  this.setWorldBounds(worldbounds);

  this._keypress_handlers = {};
}
Viewport.New = function(opts) {
  var view = Object.create(Viewport);
  view._initialize(opts);
  return view;
}
Viewport.setPxRect = function(blob) {
  this._pxrect = Rect.New(blob);
  if(this._pxrect.h < 1 || this._pxrect.w < 1)
    throw new Error('pixel target must be at least 1 pixel wide & tall');
  this._refreshTransform();
}
Viewport.setViewRect = function(blob) {
  this._viewrect = Rect.New(blob);
  if(this._viewrect.h <= 0 || this._viewrect.w <= 0)
    throw new Error('the view must be wider & taller than 0');
  this._refreshTransform();
}
Viewport._refreshTransform = function() {
  var scale       = this._pxrect.h / this._viewrect.h;
  this._scale     = scale;
  this._scale_inv = 1/scale;
  this._x_offset  = this._pxrect.l - scale * this._viewrect.l;
  this._y_offset  = this._pxrect.t - scale * this._viewrect.t;
  this._exec_transform_listeners();
}

// sets the boundaries of the planar area we want to display
Viewport.setWorldBounds = function(blob) {
  this._worldbounds = Rect.New(blob);
  if(this._worldbounds.h <= 0 || this._worldbounds.w <= 0)
    throw new Error('world bounds must be wider & taller than 0');
  this.restrictViewToWorld();
}
// set slack allowed between viewport edge and world boundary
Viewport.setPxMargin = function(val) {
  this._px_margin = val;
  this.restrictViewToWorld();
}
Viewport.restrictViewToWorld = function() {
  var WM  = this._px_margin * this._scale_inv; // world margin
  var wbd = this._worldbounds;
  var vrt = this._viewrect;

  var dx = 0;
  var dy = 0;

  // horizontal:
  // center if too small
  if(wbd.w + 2*WM < vrt.w) {
    var wcenter = wbd.center()[0];
    var vcenter = vrt.center()[0];
    dx = wcenter - vcenter;
  // snap in horizontally if large enough
  } else {
    var dl = (wbd.l - WM) - vrt.l;
    var dr = vrt.r - (wbd.r + WM);
         if(dl > 0) dx = dl;
    else if(dr > 0) dx = -dr;
  }

  // vertical:
  // center if too small
  if(wbd.h + 2*WM < vrt.h) {
    var wcenter = wbd.center()[1];
    var vcenter = vrt.center()[1];
    dy = wcenter - vcenter;
  // snap in vertically if large enough
  } else {
    var dt = (wbd.t - WM) - vrt.t;
    var db = vrt.b - (wbd.b + WM);
         if(dt > 0) dy = dt;
    else if(db > 0) dy = -db;
  }

  this._viewrect.translateBy(dx,dy);
  this._refreshTransform();
}
Viewport.zoomToFit = function() {
  var PXM = this._px_margin;
  var wbd = this._worldbounds;
  var pxr = this._pxrect;

  // perfect fit: SCALE * wbd.w === pxbd.w - 2PXM
  var xscale   = (pxr.w - 2*PXM) / wbd.w;
  var yscale   = (pxr.h - 2*PXM) / wbd.h;
  var scale    = Math.min(xscale,yscale);
  var scaleinv = 1.0/scale;
  // so, view should have width/height 
  this._viewrect.setWidthHeightFromCenterTo(pxr.w * scaleinv,
                                            pxr.h * scaleinv);
  this.restrictViewToWorld();
}
Viewport.setViewAspectRatio = function(aspect) {
  var h = this._viewrect.h;
  var w = h * aspect;
  this._viewrect.setWidthHeightFromCenterTo(w,h);
  this.restrictViewToWorld();
}

Viewport.addTransformListener = function(obj, method) {
  //method.call(obj);
  this._transform_listeners.push([obj,method]);
}
Viewport._exec_transform_listeners = function() {
  for(var k=0; k<this._transform_listeners.length; k++) {
    var pair = this._transform_listeners[k];
    pair[1]();
  }
}
Viewport.removeTransformListener = function(obj) {
  var idx = null;
  for(var k=0; k<this._transform_listeners.length; k++) {
    if(this._transform_listeners[k][0] === obj) idx = k;
  }
  if(idx !== null) this._transform_listeners.splice(idx, 1);
}








// basic camera control execution
Viewport._do_pan = function(dxpx, dypx) {
  // transform to a viewport offset
  var dxv = dxpx * this._scale_inv;
  var dyv = dypx * this._scale_inv;
  this._viewrect.translateBy(dxv,dyv);
  this.restrictViewToWorld();
}
Viewport._do_zoom = function(dval) {
  var scaling = Math.pow(2,dval/200.0);
  this._viewrect.scaleFromCenterBy(scaling);
  this.restrictViewToWorld();
}

Viewport._contains_cursor = function(px,py) {
  return this._pxrect.contains(px,py);
}

Viewport.onWheel      = function(clbk) { this._handle_wheel = clbk; }
Viewport.onMouseDown  = function(clbk) { this._handle_mousedown = clbk; }
Viewport.onDragIdle   = function(clbk) { this._handle_dragidle = clbk; }
Viewport.onDragMove   = function(clbk) { this._handle_dragmove = clbk; }
Viewport.onDragEnd    = function(clbk) { this._handle_dragend = clbk; }
Viewport.onHoverIn    = function(clbk) { this._handle_hoverin = clbk; }
Viewport.onHoverMove  = function(clbk) { this._handle_hovermove = clbk; }
Viewport.onHoverOut   = function(clbk) { this._handle_hoverout = clbk; }
Viewport._handle_wheel      = function(dval) {};
Viewport._handle_mousedown  = function(x,y,mods) {};
Viewport._handle_dragidle   = function(x,y,mods) {};
Viewport._handle_dragmove   = function(x,y,dx,dy,mods) {};
Viewport._handle_dragend    = function(x,y,mods) {};
Viewport._handle_hoverin    = function(x,y) {};
Viewport._handle_hovermove  = function(x,y) {};
Viewport._handle_hoverout   = function() {};

// viewport key handling and global key handling
var global_keypress_callbacks = {};
function translate_keycode(key) {
  if(key.length > 1) {
    if(key === 'Backspace') return 8; // why? I dunno.
  } else
  if(key.length === 1) {
    return key.charCodeAt(0);  // convert character to a number
  }
}
// global
exports.onKeyPress = function(key, func) {
  key = translate_keycode(key);
  global_keypress_callbacks[key] = func;
}
// per-viewport
Viewport.onKeyPress = function(key, func) {
  key = translate_keycode(key);
  this._keypress_handlers[key] = func;
}



// we stick some logic for the main viewport here
// in order to simplify what has to go into the main index file
var WorkspaceViewport = Object.create(Viewport);
WorkspaceViewport.New = function(opts) {
  var workspace = Object.create(WorkspaceViewport);
  Viewport._initialize.call(workspace, opts); // super constructor

  workspace._logfunc = opts.logfunc || function(){};
  workspace._mode    = null;
  workspace._selection = null;
  workspace._selection_mode = 'marquee';

  return workspace;
}
WorkspaceViewport.setMarqueeSelect = function() {
  this._selection_mode = 'marquee';
}
WorkspaceViewport.setAnnulusSelect = function(w) {
  this._selection_mode = 'annulus';
  this._annulus_width = w;
}
WorkspaceViewport.getAnnulusSelect = function() {
  return this.dxinv(this._annulus_width) || 0;
}
// seal up this viewport's behavior
WorkspaceViewport.onWheel     = function(){};
WorkspaceViewport.onMouseDown = function(){};
WorkspaceViewport.onDragIdle  = function(){};
WorkspaceViewport.onDragMove  = function(){};
WorkspaceViewport.onDragEnd   = function(){};
// and define fixed behavior
WorkspaceViewport._handle_wheel = function(dval) {
  var workspace = this;
  workspace._do_zoom(dval);

  // make sure we call the timeout function exactly once,
  // after a period of 500ms during which we received no further
  // wheel handling events.
  if(workspace._zoom_log_timeout) {
    clearTimeout(workspace._zoom_log_timeout);
  } else {
    workspace._logfunc('START_ZOOM');
  }
  workspace._zoom_log_timeout = setTimeout(function() {
    workspace._logfunc('END_ZOOM');
    workspace._zoom_log_timeout = null;
  }, 500);

  exports.refresh(); // re-draw everything
}
WorkspaceViewport._handle_mousedown = function(px,py,mods) {
  this._mode = 'select';
  this._mode = (mods.option)? 'pan'  : this._mode;
  this._mode = (mods.cmd)?    'grab' : this._mode;

  var vx = this.xinv(px);
  var vy = this.yinv(py);

  if(this._mode === 'grab') {
    this._grabstart_callback(vx,vy);
  } else
  if(this._mode === 'select') {
    this._selection = {
      anchor: [ vx, vy ],
      rect:   Rect.New({ l:vx, r:vx, t:vy, b:vy }),
      invert: mods.shift,
    };

    var ret = this._selectstart_callback(this._selection);
    if(ret === 'abort') return false; // signal not to capture the click/drag
    if(ret === 'dograb') {
      this._selection = null;
      this._mode = 'grab';
      this._grabstart_callback(vx,vy);
    }
  } else
  if(this._mode === 'pan') {
    this._logfunc('START_PAN');
  }
  return true; // signal that YES, we want to capture the click/drag
}
WorkspaceViewport._handle_dragidle = function(px,py,mods) {
  var vx = this.xinv(px);
  var vy = this.yinv(py);

  if(this._mode === 'grab') {
    this._grabidle_callback(vx,vy);
  }
}
WorkspaceViewport._handle_dragmove = function(x,y,dx,dy,mods) {
  var  vx = this.xinv(x);
  var  vy = this.yinv(y);
  var vdx = this.dxinv(dx);
  var vdy = this.dyinv(dy);

  if(this._mode === 'grab') {
    this._grabmove_callback(vx,vy,vdx,vdy);
  } else
  if(this._mode === 'select') {
    this._selection.rect = Rect.New({
      l: Math.min(this._selection.anchor[0], vx),
      r: Math.max(this._selection.anchor[0], vx),
      t: Math.min(this._selection.anchor[1], vy),
      b: Math.max(this._selection.anchor[1], vy),
    });

    this._selectmove_callback(this._selection, vx,vy,vdx,vdy);
  } else
  if(this._mode === 'pan') {
    this._do_pan(-dx,-dy);
    exports.refresh();
  }
}
WorkspaceViewport._handle_dragend = function(x,y,mods) {
  if(this._mode === 'grab') {
    this._grabend_callback();
  } else
  if(this._mode === 'select') {
    this._selection = null;
    this._selectend_callback();
  } else
  if(this._mode === 'pan') {
    this._logfunc('END_PAN');
  }
}

// define special drawing behavior
WorkspaceViewport._draw_viewport = function() {
  drawing_api.pushStyle();
  Viewport._draw_viewport.call(this); // super call
  drawing_api.popStyle();

  // now go ahead and sneak in a drawing of the selection rectangle
  if(this._selection) {
    var rect = this._selection.rect;
    drawing_api.pushStyle();

    drawing_api.setFillStyle('rgba(223,223,127,0.25)');
    drawing_api.setStrokeStyle('rgb(223,223,127)');

    drawing_api.beginPath();
    if(this._selection_mode === 'marquee') {
      drawing_api.rect(rect.l, rect.t, rect.w, rect.h);
    }
    else if(this._selection_mode === 'annulus') {
      var w = this.dxinv(this._annulus_width);

      drawing_api.moveTo(rect.l-0.5*w, rect.t-0.5*w);
      drawing_api.lineTo(rect.r+0.5*w, rect.t-0.5*w);
      drawing_api.lineTo(rect.r+0.5*w, rect.b+0.5*w);
      drawing_api.lineTo(rect.l-0.5*w, rect.b+0.5*w);
      drawing_api.lineTo(rect.l-0.5*w, rect.t-0.5*w);

      drawing_api.moveTo(rect.l+0.5*w, rect.t+0.5*w);
      drawing_api.lineTo(rect.l+0.5*w, rect.b-0.5*w);
      drawing_api.lineTo(rect.r-0.5*w, rect.b-0.5*w);
      drawing_api.lineTo(rect.r-0.5*w, rect.t+0.5*w);
      drawing_api.lineTo(rect.l+0.5*w, rect.t+0.5*w);
    }
    drawing_api.closePath();
    drawing_api.fill();
    drawing_api.stroke();

    drawing_api.popStyle();
  }
}
WorkspaceViewport._selectstart_callback = function(){};
WorkspaceViewport._selectmove_callback  = function(){};
WorkspaceViewport._selectend_callback   = function(){};
WorkspaceViewport._grabstart_callback = function(){};
WorkspaceViewport._grabidle_callback  = function(){};
WorkspaceViewport._grabmove_callback  = function(){};
WorkspaceViewport._grabend_callback   = function(){};
WorkspaceViewport.onSelectStart = function(f) {
  this._selectstart_callback = f; }
WorkspaceViewport.onSelectMove  = function(f) {
  this._selectmove_callback = f; }
WorkspaceViewport.onSelectEnd   = function(f) {
  this._selectend_callback = f; }
WorkspaceViewport.onGrabStart = function(f) { this._grabstart_callback = f; }
WorkspaceViewport.onGrabIdle  = function(f) { this._grabidle_callback = f; }
WorkspaceViewport.onGrabMove  = function(f) { this._grabmove_callback = f; }
WorkspaceViewport.onGrabEnd   = function(f) { this._grabend_callback = f; }










var CURR_VIEWPORT;
var HOVER_FOCUS;
var WIDGET_LIST   = [];
var VIEWPORT_LIST = [];

exports.createViewport = function(opts) {
  return Viewport.New(opts);
}
exports.createWorkspaceViewport = function(opts) {
  return WorkspaceViewport.New(opts);
}
exports.addViewport = function(viewport) {
  if(!Viewport.isPrototypeOf(viewport))
    throw new Error("Argument must be a Viewport");

  // would be good to guard against double-adding a viewport
  VIEWPORT_LIST.push(viewport);
}
exports.addWidget = function(widget) {
  WIDGET_LIST.push(widget);
}
exports.removeWidget = function(widget) {
  var idx = null;
  for(var k=0; k<WIDGET_LIST.length; k++) {
    if(WIDGET_LIST[k] === widget) idx = k;
  }
  if(idx !== null) WIDGET_LIST.splice(idx, 1);
}

function get_viewport_at(px,py) {
  for(var k=WIDGET_LIST.length-1; k>=0; k--)
    if(WIDGET_LIST[k]._contains_cursor(px,py))
      return WIDGET_LIST[k];
  for(var k=VIEWPORT_LIST.length-1; k>=0; k--)
    if(VIEWPORT_LIST[k]._contains_cursor(px,py))
      return VIEWPORT_LIST[k];
}
function get_widget_at(px,py) {
  for(var k=WIDGET_LIST.length-1; k>=0; k--)
    if(WIDGET_LIST[k]._contains_cursor(px,py))
      return WIDGET_LIST[k];
}

function clear_current_viewport() {
  if(CURR_VIEWPORT) {
    ctxt.restore();
    CURR_VIEWPORT = null;
  }
}
function set_current_viewport(viewport) {
  var check_fail = true;
  for(var k=0; k<VIEWPORT_LIST.length; k++) {
    if(VIEWPORT_LIST[k] === viewport) {
      check_fail = false;
      break;
    }
  }
  if(check_fail) {
    for(var k=0; k<WIDGET_LIST.length; k++) {
      if(WIDGET_LIST[k] === viewport) {
        check_fail = false;
        break;
      }
    }
  }
  if(check_fail)
    throw new Error("Cannot set a Viewport as current that hasn't been "+
                    "previously added to the display");

  clear_current_viewport();
  CURR_VIEWPORT = viewport;
  if(ctxt) {
    ctxt.save();

    var pxbox = CURR_VIEWPORT._pxrect;
    ctxt.beginPath();
    ctxt.moveTo(pxbox.l, pxbox.t);
    ctxt.lineTo(pxbox.r, pxbox.t);
    ctxt.lineTo(pxbox.r, pxbox.b);
    ctxt.lineTo(pxbox.l, pxbox.b);
    ctxt.lineTo(pxbox.l, pxbox.t);
    ctxt.clip();
  }
}


var drawing_api = {
  beginPath:  function() { ctxt.beginPath(); },
  closePath:  function() { ctxt.closePath(); },
  fill:       function() { ctxt.fill(); },
  stroke:     function() { ctxt.stroke(); },
  moveTo: function(x,y) {
    ctxt.moveTo(CURR_VIEWPORT.x(x), CURR_VIEWPORT.y(y));
  },
  lineTo: function(x,y) {
    ctxt.lineTo(CURR_VIEWPORT.x(x), CURR_VIEWPORT.y(y));
  },
  bezierCurveTo: function(cp1x, cp1y, cp2x, cp2y, x, y) {
    ctxt.bezierCurveTo(
      CURR_VIEWPORT.x(cp1x),  CURR_VIEWPORT.y(cp1y),
      CURR_VIEWPORT.x(cp2x),  CURR_VIEWPORT.y(cp2y),
      CURR_VIEWPORT.x(x),     CURR_VIEWPORT.y(y)
    );
  },
  rect: function(x,y,w,h) {
    ctxt.rect(
      CURR_VIEWPORT.x(x), CURR_VIEWPORT.y(y),
      CURR_VIEWPORT.dx(w), CURR_VIEWPORT.dy(h)
    );
  },
  circle: function(x,y,r) {
    ctxt.arc( CURR_VIEWPORT.x(x), CURR_VIEWPORT.y(y),
              CURR_VIEWPORT.dx(r), 0, 2*Math.PI );
  },
  pxSquare: function(x,y,halfside) {
    var px = CURR_VIEWPORT.x(x);
    var py = CURR_VIEWPORT.y(y);
    ctxt.rect(
      px - halfside, py - halfside,
      2*halfside, 2*halfside
    );
  },
  pxCirc: function(x,y,radius) {
    ctxt.arc(
      CURR_VIEWPORT.x(x), CURR_VIEWPORT.y(y),
      radius, 0, 2*Math.PI
    );
  },
  fillText: function(txt, x, y, maxw) {
    var px = CURR_VIEWPORT.x(x);
    var py = CURR_VIEWPORT.y(y);
    //var maxpw = (maxw !== undefined )? CURR_VIEWPORT.dx(maxw) : maxw;
    ctxt.fillText(txt, px, py);
  },
  setFont:        function(str)   { ctxt.font = str; },
  setTextAlign:   function(str)   { ctxt.textAlign = str; },
  setTextBaseline: function(str)  { ctxt.textBaseline = str; },
//  fillRect: function(x,y,w,h) {
//    ctxt.fillRect(
//      CURR_VIEWPORT.x(x), CURR_VIEWPORT.y(y),
//      CURR_VIEWPORT.dx(w), CURR_VIEWPORT.dy(h)
//    );
//  },
//  strokeRect: function(x,y,w,h) {
//    ctxt.strokeRect(
//      CURR_VIEWPORT.x(x), CURR_VIEWPORT.y(y),
//      CURR_VIEWPORT.dx(w), CURR_VIEWPORT.dy(h)
//    );
//  },
  lineWidth:      function(w)     { ctxt.lineWidth = w; },
  lineCap:        function(val)   { ctxt.lineCap = val; },
  lineJoin:       function(val)   { ctxt.lineJoin = val; },
  miterLimit:     function(ratio) { ctxt.miterLimit = ratio; },
  setLineDash:    function(segs)  { ctxt.setLineDash(segs); },
  setFillStyle:   function(arg)   { ctxt.fillStyle = arg; },
  setStrokeStyle: function(arg)   { ctxt.strokeStyle = arg; },
  pushStyle:      function()      { ctxt.save(); },
  popStyle:       function()      { ctxt.restore(); },
  plotDot: function(x,y) {
    var px = CURR_VIEWPORT.x(x);
    var py = CURR_VIEWPORT.y(y);
    ctxt.beginPath();
    ctxt.moveTo(px,py);
    ctxt.lineTo(px+0.1,py+0.1);
    //ctxt.beginPath();
    //ctxt.arc( CURR_VIEWPORT.x(x), CURR_VIEWPORT.y(y), 0.5*d, 0, 2*Math.PI );
    //ctxt.closePath();
  }
};

Viewport.onDraw = function(clbk) {
  this._draw_callback = clbk;
}
Viewport._draw_viewport = function() {
  if(this !== CURR_VIEWPORT)
    throw new Error('Cannot Draw Viewport Unless it\'s CURRENT');
  this._draw_callback(drawing_api);
}










// from stackoverflow
function clearcanvas() {
  //ctxt.save();
  //ctxt.setTransform(1, 0, 0, 1, 0, 0);
  // ctxt.clearRect(0,0, ctxt.canvas.width, ctxt.canvas.height);
  ctxt.clearRect(0, 0, canvas.width, canvas.height);
  //ctxt.restore();
}


function do_draw() {
  clearcanvas(canvas, ctxt);
  VIEWPORT_LIST.forEach(function(vp) {
    set_current_viewport(vp);
    CURR_VIEWPORT._draw_viewport();
  });
  WIDGET_LIST.forEach(function(vp) {
    set_current_viewport(vp);
    CURR_VIEWPORT._draw_viewport();
  })
  clear_current_viewport();
}
exports.refresh = function() {
  do_draw();
}

var resize_callback = function(){};
exports.onResize = function(clbk) {
  resize_callback = clbk;
}
function resize_canvas() {
  // retreive the actual screen size of the canvas in pixels
  // according to the CSS computed values
  var canvas_style = window.getComputedStyle(canvas);
  canvasW = pxstr_to_num(canvas_style.width);
  canvasH = pxstr_to_num(canvas_style.height);
  canvasWoverH = canvasW / canvasH;

  // enforce this size on the canvas object so that
  // we get a 1-1 mapping of coordinate systems
  canvas.width = canvasW;
  canvas.height = canvasH;

  // allow for client to hook in updates to viewports here
  resize_callback();

  do_draw();
}


exports.setup_canvas = function(canvas_param) {
  var $canvas = $(canvas_param);
  canvas      = $canvas[0];
  ctxt        = canvas.getContext("2d");

  var resize_timeout;
  window.addEventListener("resize", function() {
    if(!resize_timeout) {
      resize_timeout = setTimeout(function() {
        resize_timeout = null;
        resize_canvas();
      }, 66);
    }
  }, false)
  resize_canvas();


  // SETUP a dummy shape / draw callback
  TRAY = null; // what do we set up the tray to if anything?
  OVERLAY = null; // what do we set this up to?

  do_draw();


  // State Data
  var freshx        = 0;
  var freshy        = 0;
  var lastx         = 0;
  var lasty         = 0;
  var mouse_is_down = false;
  // Helper to update x/y values
  function extract_fresh_event_data(evt) {
    var pos = canvas.getBoundingClientRect();
    freshx = evt.clientX - pos.left;
    freshy = evt.clientY - pos.top;
  }

  // disable context menus on the canvas so right click can be useful
  $canvas.bind('contextmenu', function(e){
    return false;
  });

  // install wheel-handler
  canvas.addEventListener('wheel', function(evt) {
    extract_fresh_event_data(evt);
    var dh = evt.deltaY;
    var vp = get_viewport_at(freshx,freshy);
    if(vp) {
      vp._handle_wheel(dh);
      evt.preventDefault();
    }
  });

  // install mouse event handlers
  var drag_idle_delay     = 20;
  var drag_idle_timeout   = null;
  var drag_target         = null;
  var drag_modifiers      = {};
  function drag_idle_callback() {
    // delegate handling behavior here
    drag_target._handle_dragidle(freshx, freshy, drag_modifiers);
    drag_idle_timeout = setTimeout(drag_idle_callback, drag_idle_delay);
  }
  function update_hover() {
    var captured = false;
    var widget_over = get_widget_at(freshx,freshy);
    if(widget_over) {
      if(HOVER_FOCUS === widget_over) {
        HOVER_FOCUS._handle_hovermove(freshx,freshy);
      } else {
        if(HOVER_FOCUS) HOVER_FOCUS._handle_hoverout();
        HOVER_FOCUS = widget_over;
        HOVER_FOCUS._handle_hoverin(freshx,freshy);
      }
    } else if(HOVER_FOCUS) {
      HOVER_FOCUS._handle_hoverout();
      HOVER_FOCUS = null;
    }
  }
  //var IS_ON_MACOSX = navigator.userAgent.indexOf('Mac OS X') >= 0;
  canvas.addEventListener('mousedown', function(evt) {
    extract_fresh_event_data(evt);

    if(evt.which === 1) { // left button
      mouse_is_down = true;
      lastx = freshx;
      lasty = freshy;

      if(HOVER_FOCUS) {
        HOVER_FOCUS._handle_hoverout();
        HOVER_FOCUS = null;
      }

      // dispatch this event to a viewport
      var vp = get_viewport_at(freshx,freshy);
      if(vp) {
        drag_modifiers.option = !!evt.altKey;
        drag_modifiers.cmd    = !!evt.ctrlKey;
        drag_modifiers.shift  = !!evt.shiftKey;

        var response = vp._handle_mousedown(freshx, freshy, drag_modifiers);
        if(response) {
          drag_target = vp;
          drag_idle_timeout = setTimeout(drag_idle_callback, drag_idle_delay);
        }
      }
    }
  }, false);
  function clear_drag() {
    clearTimeout(drag_idle_timeout);
    drag_target._handle_dragend(freshx,freshy, drag_modifiers);
    drag_target = null;
    update_hover();
  }
  canvas.addEventListener('mousemove', function(evt) {
    extract_fresh_event_data(evt);

    // continue an existing drag if one was registered
    if(drag_target) {
      var dx = freshx - lastx;
      var dy = freshy - lasty;

      // dispatch
      drag_target._handle_dragmove(freshx, freshy, dx, dy, drag_modifiers);

      lastx = freshx;
      lasty = freshy;
    // otherwise, safety to make sure we clear drags
    // and handle hover behavior
    } else {
      update_hover();
    }
  }, false);
  canvas.addEventListener('mouseup', function(evt) {
    extract_fresh_event_data(evt);
    if(evt.which === 1 && drag_target) { // left button
      clear_drag();
    }
  }, false);


  var acode = ('a').charCodeAt();
  var zcode = ('z').charCodeAt();
  var Acode = ('A').charCodeAt();
  var Zcode = ('Z').charCodeAt();
  var offset = acode - Acode;
  function toLowerCode(code) {
    if (Acode <= code && code <= Zcode) {
      return code + offset;
    }
    return code;
  }

  // install key event handlers
  $(window).keydown(function(evt) {
    if(!evt.altKey && !evt.ctrlKey && !evt.metaKey)
      evt.preventDefault();
  })
  $(window).keyup(function(evt) {
  //window.addEventListener('keypress', function(evt) {
    //var modifiers = {
    //  option : !!evt.altKey,
    //  cmd    : !!evt.metaKey,
    //  shift  : !!evt.shiftKey,
    //};
    if(!evt.altKey && !evt.ctrlKey && !evt.metaKey)
      evt.preventDefault();

    // first try dispatching to a viewport
    var vp = get_viewport_at(freshx,freshy);
    if(vp) {
      var clbk = vp._keypress_handlers[toLowerCode(evt.which)];
      var result = clbk;
      if(clbk) result = clbk(freshx, freshy);

      if(!result) vp = null; // do fall back
    }
    // if that fails, then dispatch to global handlers
    if(!vp) {
      var clbk = global_keypress_callbacks[toLowerCode(evt.which)];
      var result = clbk;
      if(clbk) result = clbk(freshx, freshy);
    }
  });

}









})(typeof window === 'undefined');
