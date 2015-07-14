/*  
 *  widgets.js
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
if(on_node) throw new Error("Cannot Load Widgets Module in Node");
var exports = (window['widgets']={});

if(typeof jQuery === 'undefined' || typeof paper === 'undefined') {
  throw new Error("Cannot Load Widgets Module w/o jQuery and PaperJS loaded");
}

var rawdisplay  = window.rawdisplay;
if(!rawdisplay)
  throw new Error("Must have rawdisplay loaded before widgets");



var Rect        = rawdisplay._Rect;
var Viewport    = rawdisplay._Viewport;


var Widget      = Object.create(Viewport);
//var Widget = {};


// panels don't react
var Panel         = (exports.Panel        = Object.create(Widget));
var ViewPanel     = (exports.ViewPanel    = Object.create(Widget));
var Button        = (exports.Button       = Object.create(Widget));
var ToggleButton  = (exports.ToggleButton = Object.create(Button));
var Handle        = (exports.Handle       = Object.create(Widget));
var Slider        = (exports.Slider       = Object.create(Widget));


function isdef(val) {
  return val !== undefined;
}

// --------------------------------------------------------------------------
//                            MASTER WIDGET
// --------------------------------------------------------------------------

// seal up the widgets from having client behaviors be defined
Widget.onWheel      = function(){};
Widget.onMouseDown  = function(){};
Widget.onDragIdle   = function(){};
Widget.onDragMove   = function(){};
Widget.onDragEnd    = function(){};
Widget.onHoverIn    = function(){};
Widget.onHoverMove  = function(){};
Widget.onHoverOut   = function(){};

// helper 
function set_common_params(widget, p) {
  var pxrect = {};

  widget._positioning = (p.anchor)? 'anchored' : 'fixed' ;
  if(widget._positioning === 'fixed') {
    pxrect = Rect.New(p.rect);
  } else {
    if(!p.width || !p.height) throw new Error(
      'width & height of non-fixed widgets must be specified');
    pxrect = Rect.New({x:0,y:0, w:p.width, h:p.height});
  }
  widget._wh = [ pxrect.w, pxrect.h ];
  var viewrect = {x:0,y:0, w:pxrect.w, h:pxrect.h};
  widget._initialize({
    pxrect:       pxrect,
    viewrect:     viewrect,
    worldbounds:  viewrect,
  });

  if(widget._positioning === 'anchored') {
    widget._anchor        = p.anchor.slice();
    widget._anchored_view = p.anchored_view;
    if(!Viewport.isPrototypeOf(widget._anchored_view))
      throw new Error("Must supply 'anchored_view' Viewport object if "+
                      "creating an anchored widget");
    // handle view updates by propagating through
    widget._anchored_view.addTransformListener(widget, function() {
      widget.setAnchorRect();
    })

    widget._pref_pos      = p.relative_pos || 'center';
    widget._anchor_dist   = p.anchor_dist || 0;
    widget.setAnchorRect();
  }
}

Widget.destroyCleanup = function() {
  if(this._anchored_view) {
    this._anchored_view.removeTransformListener(this);
  }
  rawdisplay.removeWidget(this);
}

Widget.resetAnchor = function(p) {
  if(p.anchor)              this._anchor      = p.anchor.slice();
  if(p.relative_pos)        this._pref_pos    = p.relative_pos;
  if(isdef(p.anchor_dist))  this._anchor_dist = p.anchor_dist;
  // need more logic for resizing safely that I haven't written
  //if(p.width)               this._wh[0]       = p.width;
  //if(p.height)              this._wh[1]       = p.height;
  this.setAnchorRect();
}
Widget.setAnchorRect = function() {
  if(this._positioning !== 'anchored') return;

  // pull the anchor point back into pixel coordinates
  var a = this._anchored_view.xy(this._anchor);
  var ax = a[0];
  var ay = a[1];

  // place rectangle at the approporiate position relative to the anchor
  // Here is a handy chart.
  // Note that the positioning seems backwards, because it's describing
  // the location of the box relative to the anchor point
  //
  //      bottom-right       bottom-center      bottom-left
  //              *----------------*----------------*
  //              |                |                |
  //              |   [=========================]   |
  //              |   [            |            ]   |
  //              |   [            |            ]   |
  //              |   [            |            ]   |
  //              |   [            |            ]   |
  //              |   [            | center     ]   |
  // center-right *---[------------*------------]---* center-left
  //              |   [            |            ]   |
  //              |   [            |            ]   |
  //              |   [            |            ]   |
  //              |   [            |            ]   |
  //              |   [            |            ]   |
  //              |   [=========================]   |
  //              |                |                |
  //              *----------------*----------------*
  //        top-right         top-center          top-left
  //
  // The margin between the outer box and the inner (actual) box is
  // specified by 'anchor_dist'

  // determine which position to use in order to keep the widget on screen?
  var relpos = this._pref_pos;

  var w = this._wh[0]; var h = this._wh[1];
  var pxrect = { w:w, h:h };
  var m = this._anchor_dist;
  switch(relpos) {
  case 'bottom-right':    pxrect.l = ax+m;    pxrect.t = ay+m;    break;
  case 'bottom-center':   pxrect.l = ax-w/2;  pxrect.t = ay+m;    break;
  case 'bottom-left':     pxrect.r = ax-m;    pxrect.t = ay+m;    break;
  case 'center-right':    pxrect.l = ax+m;    pxrect.t = ay-h/2;  break;
  case 'center':          pxrect.l = ax-w/2;  pxrect.t = ay-h/2;  break;
  case 'center-left':     pxrect.r = ax-m;    pxrect.t = ay-h/2;  break;
  case 'top-right':       pxrect.l = ax+m;    pxrect.b = ay-m;    break;
  case 'top-center':      pxrect.l = ax-w/2;  pxrect.b = ay-m;    break;
  case 'top-left':        pxrect.r = ax-m;    pxrect.b = ay-m;    break;
  default: throw new Error('bad relative position keyword: '+relpos);
  }
  this.setPxRect(pxrect);
}
Widget.width = function() { return this._wh[0]; }
Widget.height = function() { return this._wh[1]; }


function text_draw(widget, drawAPI) {
  drawAPI.setTextAlign('center');
  drawAPI.setFont(widget._textsize+'pt Arial');
  drawAPI.setTextBaseline('middle');
  drawAPI.fillText( widget._text, widget.width()/2, widget.height()/2 );
}


// --------------------------------------------------------------------------
//                          INDIVIDUAL WIDGETS
// --------------------------------------------------------------------------

// --------------------------------------------------------------------------
//    PANEL

Panel.New = function(p) {
  var panel = Object.create(Panel);
  set_common_params(panel, p);
  panel._color = p.color || 'rgba(223,223,223,0.5)';
  panel._text  = p.text  || '';
  panel._textsize = p.textsize || 10;
  return panel;
}
Panel.onDraw = function(){}; // seal
Panel._draw_callback = function(drawAPI) {
  // draw a rectangle with the specified width/height
  drawAPI.pushStyle();
    drawAPI.setFillStyle(this._color);
    drawAPI.beginPath();
    drawAPI.rect( 0, 0, this.width(), this.height() );
    drawAPI.closePath();
    drawAPI.fill();

    drawAPI.setFillStyle('rgba(63,63,63,1)');
    text_draw(this, drawAPI);
  drawAPI.popStyle();
}

// --------------------------------------------------------------------------
//    VIEW_PANEL

ViewPanel.New = function(p) {
  var panel = Object.create(ViewPanel);
  set_common_params(panel, p);
  panel.setPxMargin(p.px_margin);
  panel.setWorldBounds(p.worldbounds);

  panel._color = p.color || 'rgb(255,255,255)';
  panel._border_color = p.bordercolor || 'rgb(207,207,207)';
  panel._viewpanel_draw_callback = function(){};

  panel._state = 'plain';
  if(p.onPress) panel.onPress(p.onPress);

  return panel;
}
ViewPanel.onDraw = function(clbk) {
  this._viewpanel_draw_callback = clbk;
}
ViewPanel._draw_callback = function(drawAPI) {
  var halfpx = this._scale_inv*0.5;
  var l = this._viewrect.l + halfpx;
  var t = this._viewrect.t + halfpx;
  var w = this._viewrect.w - halfpx*2;
  var h = this._viewrect.h - halfpx*2;

  // Background Fill
  drawAPI.pushStyle();
    drawAPI.setFillStyle(this._color);
    drawAPI.beginPath();
    drawAPI.rect( l, t, w, h );
    drawAPI.closePath();
    drawAPI.fill();
  drawAPI.popStyle();

  drawAPI.pushStyle();
    this._viewpanel_draw_callback(drawAPI);
  drawAPI.popStyle();

  // Frame
  drawAPI.pushStyle();
    drawAPI.setStrokeStyle(this._border_color);
    drawAPI.beginPath();
    drawAPI.rect( l, t, w, h );
    drawAPI.closePath();
    drawAPI.stroke();
  drawAPI.popStyle();
}

ViewPanel._press_callback = function(){};
ViewPanel.onPress = function(clbk) {
  this._press_callback = clbk;
}

ViewPanel._handle_hoverin = function(x,y) {
  this._state = 'hover';
  rawdisplay.refresh();
}
ViewPanel._handle_hoverout = function() {
  this._state = 'plain';
  rawdisplay.refresh();
}
ViewPanel._handle_mousedown = function(x,y,mods) {
  this._state = 'press';
  rawdisplay.refresh();
  return true; // subscribe to drag event
}
ViewPanel._handle_dragmove = function(px,py,dpx,dpy,mods) {
  var in_widget = this._contains_cursor(px,py);
  if(this._state === 'press' && !in_widget) {
    this._state = 'plain';
    rawdisplay.refresh();
  } else
  if(this._state === 'plain' && in_widget) {
    this._state = 'press';
    rawdisplay.refresh();
  }
}
ViewPanel._handle_dragend = function(x,y,mods) {
  if(this._state === 'press') {
    this._press_callback();
  }
  this._state = 'plain'; // safety
  rawdisplay.refresh();
}


// --------------------------------------------------------------------------
//    BUTTON

function btn_fill_color(state, alpha) {
  switch(state) {
  case 'plain': return 'rgba(239,239,239,'+alpha+')';
  case 'hover': return 'rgba(223,223,223,'+alpha+')';
  case 'press': return 'rgba(191,191,191,'+alpha+')';
  }
}
function btn_rim_color(state, alpha) {
  switch(state) {
  case 'plain': return 'rgba(191,191,191,'+alpha+')';
  case 'hover': return 'rgba(175,175,175,'+alpha+')';
  case 'press': return 'rgba(127,127,127,'+alpha+')';
  }
}
Button.New = function(p) {
  var button = Object.create(Button);
  set_common_params(button, p);

  button._alpha = isdef(p.alpha)? p.alpha : 1 ;
  button._text  = p.text || '';
  button._textsize = p.textsize || 10;

  button._state = 'plain';
  if(p.onPress) button.onPress(p.onPress);
  return button;
}
Button.onDraw = function(){}; // seal
function button_common_draw(button, drawAPI, state) {
  // draw a rectangle with the specified width/height
  drawAPI.pushStyle();
    drawAPI.setFillStyle(btn_fill_color(state, button._alpha));
    drawAPI.setStrokeStyle(btn_rim_color(state, button._alpha));
    drawAPI.beginPath();
    drawAPI.rect( 0, 0, button.width(), button.height() );
    drawAPI.closePath();
    drawAPI.fill();
    drawAPI.stroke();

    drawAPI.setFillStyle('rgb(63,63,63)');
    if(button._text)
      text_draw(button, drawAPI);
  drawAPI.popStyle();

}
Button._draw_callback = function(drawAPI) {
  button_common_draw(this, drawAPI, this._state);
}

Button._press_callback = function(){};
Button.onPress = function(clbk) {
  this._press_callback = clbk;
}

Button._handle_hoverin = function(x,y) {
  this._state = 'hover';
  rawdisplay.refresh();
}
Button._handle_hoverout = function() {
  this._state = 'plain';
  rawdisplay.refresh();
}
Button._handle_mousedown = function(x,y,mods) {
  this._state = 'press';
  rawdisplay.refresh();
  return true; // subscribe to drag event
}
Button._handle_dragmove = function(px,py,dpx,dpy,mods) {
  var in_widget = this._contains_cursor(px,py);
  if(this._state === 'press' && !in_widget) {
    this._state = 'plain';
    rawdisplay.refresh();
  } else
  if(this._state === 'plain' && in_widget) {
    this._state = 'press';
    rawdisplay.refresh();
  }
}
Button._handle_dragend = function(x,y,mods) {
  if(this._state === 'press') {
    this._press_callback();
  }
  this._state = 'plain'; // safety
  rawdisplay.refresh();
}


// --------------------------------------------------------------------------
//    TOGGLE BUTTON

ToggleButton.New = function(p) {
  var button = Object.create(ToggleButton);
  set_common_params(button, p);

  button._alpha = isdef(p.alpha)? p.alpha : 1 ;
  button._text  = p.text || '';
  button._textsize = p.textsize || 10;

  button._state = 'plain';
  button._is_down = false;
  if(p.onToggle) button.onToggle(p.onToggle);
  return button;
}
ToggleButton._draw_callback = function(drawAPI) {
  // invert display behavior if depressed
  var state = this._state;
  if(this._is_down) {
    //     if(state === 'plain') state = 'press';
    if(state === 'press') state = 'plain';
    else state = 'press';
  }
  button_common_draw(this, drawAPI, state);
}

ToggleButton.onPress = function(){}; // don't allow presses

ToggleButton._toggle_callback = function(){};
ToggleButton.onToggle = function(clbk) {
  this._toggle_callback = clbk;
}
ToggleButton.setToggleState = function(val) {
  this._is_down = val;
}

ToggleButton._handle_dragend = function(x,y,mods) {
  if(this._state === 'press') {
    this._is_down = !this._is_down;
    this._toggle_callback(this._is_down);
  }
  this._state = 'plain'; // safety
  rawdisplay.refresh();
}


// --------------------------------------------------------------------------
//    HANDLE

Handle.New = function(p) {
  var handle = Object.create(Handle);
  set_common_params(handle, p);

  handle._alpha = isdef(p.alpha)? p.alpha : 1 ;
  handle._state = 'plain';

  return handle;
}
Handle.onDraw = function(){}; // seal
Handle._draw_callback = function(drawAPI) {
  button_common_draw(this, drawAPI, this._state);
}

Handle._handle_drag_callback    = function(){};
Handle._handle_drag_start_clbk  = function(){};
Handle._handle_drag_end_clbk    = function(){};
Handle.onDragMove   = function(clbk) { this._handle_drag_callback = clbk; }
Handle.onDragStart  = function(clbk) { this._handle_drag_start_clbk = clbk; }
Handle.onDragEnd    = function(clbk) { this._handle_drag_end_clbk = clbk; }
//Handle._handle_drag_clbk        = function(){};
//Handle.onDrag       = function(clbk) { this._handle_drag_clbk = clbk; }

Handle._handle_hoverin = function() {
  this._state = 'hover';
  rawdisplay.refresh();
}
Handle._handle_hoverout = function() {
  this._state = 'plain';
  rawdisplay.refresh();
}
//function handle_drag_init(handle, px,py) {
//  //var xy    = [ handle.xinv(px), handle.yinv(py) ];
//  //handle._grab_poff = xy;
//}
//function handle_drag_update(handle, px,py) {
//  //var center = handle.x(handle.width()
//  //var xy    = [ handle.xinv(px), handle.yinv(py) ];
//  //var dxy   = Vec2.sub(xy, handle._grab_poff);
//  //xy = [ handle.x(xy[0]), handle.y(xy[1]) ];
//  var newxy = [px,py];
//  handle._handle_drag_clbk(newxy);
//}
Handle._handle_mousedown = function(x,y,mods) {
  this._state = 'press';

  console.log('pure xy mousedown', x,y);
  this._handle_drag_start_clbk([x,y]);
  rawdisplay.refresh();
  return true; // subscribe to drag event
}
Handle._handle_dragmove = function(x,y,dx,dy,mods) {
  this._handle_drag_callback([x,y]);
  rawdisplay.refresh();
}
Handle._handle_dragidle = function(x,y,mods) {
  this._handle_drag_callback([x,y]);
  rawdisplay.refresh();
}
Handle._handle_dragend = function(x,y,mods) {
  this._state = 'plain'; // safety
  this._handle_drag_end_clbk();
  rawdisplay.refresh();
}


// --------------------------------------------------------------------------
//    SLIDER

function slider_rim_color(alpha) {
  return 'rgba(159,159,159,'+alpha+')';
}
function slider_back_color(alpha) {
  return 'rgba(247,247,247,'+alpha+')';
}
Slider.New = function(p) {
  var slider = Object.create(Slider);
  set_common_params(slider, p);

  if(slider.width() < 30 || slider.height() < 30)
    throw new Error('sliders must be at least 30 px wide & tall');

  slider._alpha = isdef(p.alpha)? p.alpha : 1 ;

  slider._value = 0.5;
  if(isdef(p.value)) slider._value = Math.max(0, Math.min(1, p.value));
  //if(p.onDrag) slider.onDrag(p.onDrag);

  slider._state = 'plain';
  return slider;
}
Slider.onDraw = function(){}; // seal
Slider._draw_callback = function(drawAPI) {
  var w = this.width();
  var h = this.height();

  // handle position
  var trackheight = h - 6 - 20; // -margin -shuttle_h
  var ycenter     = (1-this._value) * trackheight + 3 + 10;

  drawAPI.pushStyle();
    drawAPI.setFillStyle(slider_back_color(this._alpha));
    drawAPI.setStrokeStyle(slider_rim_color(this._alpha));
    drawAPI.beginPath();
    drawAPI.rect( 0.5, 0.5, w-1, h-1 );
    drawAPI.closePath();
    drawAPI.fill();
    drawAPI.stroke();

    drawAPI.setFillStyle(btn_fill_color(this._state, this._alpha));
    drawAPI.setStrokeStyle(btn_rim_color(this._state, this._alpha));
    drawAPI.beginPath();
    drawAPI.rect( 3, ycenter-10, w-6, 20 );
    drawAPI.closePath();
    drawAPI.fill();
    drawAPI.stroke();
  drawAPI.popStyle();
}

Slider._slider_drag_callback = function(){};
Slider._slider_drag_start_clbk = function(){};
Slider._slider_drag_end_clbk = function(){};
Slider.onDragMove = function(clbk) {
  this._slider_drag_callback = clbk;
}
Slider.onDragStart = function(clbk) {
  this._slider_drag_start_clbk = clbk;
}
Slider.onDragEnd = function(clbk) {
  this._slider_drag_end_clbk = clbk;
}
Slider.setValue = function(val) {
  val = Math.max(0, Math.min(1, val)); // clamp to 0..1 range inclusive
  this._value = val;
}
Slider.getValue = function() { return this._value };

Slider._handle_hoverin = function() {
  this._state = 'hover';
  rawdisplay.refresh();
}
Slider._handle_hoverout = function() {
  this._state = 'plain';
  rawdisplay.refresh();
}
function update_val(slider, px,py, is_first_call) {
  var curr_val = slider._value;
  var x = slider.xinv(px);
  var y = slider.yinv(py);

  var trackheight = slider.height() - 6 - 20;
  var request_val = (y - 3 - 10) / trackheight;
  request_val = Math.max(0, Math.min(1, request_val)); // clamp
  request_val = 1-request_val; // flip axis

  // now we can ask the client how they'd like to respond
  if(is_first_call)
    slider._slider_drag_start_clbk(request_val, curr_val);
  else
    slider._slider_drag_callback(request_val, curr_val);
}
Slider._handle_mousedown = function(x,y,mods) {
  this._state = 'press';
  update_val(this, x,y, true);
  rawdisplay.refresh();
  return true; // subscribe to drag event
}
Slider._handle_dragmove = function(x,y,dx,dy,mods) {
  update_val(this, x,y);
  rawdisplay.refresh();
}
Slider._handle_dragidle = function(x,y,mods) {
  update_val(this, x,y);
  rawdisplay.refresh();
}
Slider._handle_dragend = function(x,y,mods) {
  this._state = 'plain'; // safety
  this._slider_drag_end_clbk();
  rawdisplay.refresh();
}




})(typeof window === 'undefined');
