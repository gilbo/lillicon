/*  
 *  svgparse.js
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
if(on_node) throw new Error("Cannot Load SVGParse Module in Node");
var exports = (window['svgparse']={});

// modules
var planarmap = window.planarmap;
var display = window.display;
if(typeof planarmap === 'undefined' || typeof paper === 'undefined')
  throw new Error(
    "Must have PlanarMap & Paper.JS Modules loaded before SVGParse");


var SIN_1_DEG = Math.sin(Math.PI / 180.0);

var Vec2      = primitives.Vec2;
var Arc       = contours.Arc;
var Bezier    = contours.Bezier;
var Contour   = contours.Contour;
var PlanarMap = planarmap.PlanarMap;

var fit_circle = numeric_subroutines.fit_circle;

function circle_to_arc_path(x, y, r) {
  // first the 4 side points
  var pr  = Vec2.New([x+r,y  ]);
  var pb  = Vec2.New([x  ,y+r]);
  var pl  = Vec2.New([x-r,y  ]);
  var pt  = Vec2.New([x  ,y-r]);
  // then the 4 corner points
  var pbr = Vec2.New([x+r,y+r]);
  var pbl = Vec2.New([x-r,y+r]);
  var ptl = Vec2.New([x-r,y-r]);
  var ptr = Vec2.New([x+r,y-r]);

  // now the arcs
  var abr = Arc.New(pr,pbr,pb);
  var abl = Arc.New(pb,pbl,pl);
  var atl = Arc.New(pl,ptl,pt);
  var atr = Arc.New(pt,ptr,pr);

  var circle = Contour.New([abr,abl,atl,atr]).reverse();
  return circle;
}
function rectangle_to_bz_path(left,top,right,bottom) {
  var br  = [right, bottom];
  var bl  = [left,  bottom];
  var tl  = [left,  top   ];
  var tr  = [right, top   ];
  var abr = Vec2.New(br);
  var abl = Vec2.New(bl);
  var atl = Vec2.New(tl);
  var atr = Vec2.New(tr);

  var b = Bezier.New(abr, Vec2.New(br), Vec2.New(bl), abl);
  var l = Bezier.New(abl, Vec2.New(bl), Vec2.New(tl), atl);
  var t = Bezier.New(atl, Vec2.New(tl), Vec2.New(tr), atr);
  var r = Bezier.New(atr, Vec2.New(tr), Vec2.New(br), abr);

  var rect = Contour.New([b,l,t,r]).reverse();
  return rect;
}
function is_too_short(p0,p1,p2,p3, EPSILON) {
  // measure distance of everything to p0
  var d1 = Vec2.sub(p1, p0);
  var d2 = Vec2.sub(p2, p0);
  var d3 = Vec2.sub(p3, p0);
  return Math.abs(d1[0]) < EPSILON && Math.abs(d1[1]) < EPSILON &&
         Math.abs(d2[0]) < EPSILON && Math.abs(d2[1]) < EPSILON &&
         Math.abs(d3[0]) < EPSILON && Math.abs(d3[1]) < EPSILON ;
}
function are_colinear(p0, p1, p2, EPSILON) {
  var e01     = Vec2.sub(p1,p0);
  var e02     = Vec2.sub(p2,p0);
  var e12     = Vec2.sub(p2,p1);
  var area    = Math.abs(Vec2.cross(e01,e02));
  var maxlen2 = Math.max(   Vec2.len2(e01),
                  Math.max( Vec2.len2(e02),
                            Vec2.len2(e12) ) );
  return (area <= maxlen2*EPSILON);
}
function vec_is_zero(v, EPSILON) {
  return Math.abs(v[0]) < EPSILON && Math.abs(v[1]) < EPSILON ;
}
function is_straight(p0, p1, p2, p3, h1, h2, EPSILON) {
  var no_h1 = vec_is_zero(h1, EPSILON);
  var no_h2 = vec_is_zero(h2, EPSILON);
  if(no_h1 && no_h2) return true;
  var p1_colinear = are_colinear(p1, p0, p3);
  var p2_colinear = are_colinear(p2, p0, p3);
  return (no_h1 || p1_colinear) && (no_h2 || p2_colinear);
}
function extract_arc(p0, p1, p2, p3, h1, h2, bz, EPSILON) {
  if(is_straight(p0,p1,p2,p3, h1,h2, EPSILON))  return null;
  if(vec_is_zero(h1) || vec_is_zero(h2))        return null;

  // extra length safety check...
  var e = Vec2.sub(p3, p0);
  var e_len = Vec2.len(e);
  var perp = [-e[1], e[0]];
  if(e_len < EPSILON) return null;


  // sample the Bezier curve
  var xys = bz.distributeSamplesEvenly(10).map(function(p) { return p[1]; });
  xys.push(p0);
  xys.push(p3);
  var circ = fit_circle(xys);
  // measure max Euclidean error
  var max_err = 0;
  for(var k=0; k<xys.length; k++) {
    var dx = xys[k][0] - circ.cx;
    var dy = xys[k][1] - circ.cy;
    var err = Math.abs(Math.sqrt(dx*dx + dy*dy) - circ.r);
    if(err > max_err) max_err = err;
  }
  // Reject if the error exceeds the cutoff
  if(err >= EPSILON) return null;


  // otherwise we need to compute the handle
  // normalize handle tangents
  var n01 = Vec2.normalized(h1);
  var n21 = Vec2.normalized(h2);

  // check that we expect the two vectors to intersect on the expected side
  // and we expect the normalized tangents to be roughly symmetric
  var eq_perp   =
    Math.abs(Vec2.dot(perp, n01) - Vec2.dot(perp, n21)) < SIN_1_DEG * e_len;
  var opp_edge  =
    Math.abs(Vec2.dot(e, n01) + Vec2.dot(e, n21)) < SIN_1_DEG * e_len;
  var pointing_in = Math.abs(Vec2.dot(e,n01)) > SIN_1_DEG * e_len &&
                    Math.abs(Vec2.dot(e,n21)) > SIN_1_DEG * e_len ;
  if(!pointing_in) return null;

  // construct an arc
  // want to rescale n01 s.t. <a*n01, e> = <e,e> / 2
  // i.e. the projection of n01 onto e is half the length of e
  // This means a = <e,e>/(2*<n01,e>)
  var scale = e_len*e_len / ( 2 * Vec2.dot(e, n01) );
  var handle = Vec2.add(p0, Vec2.mul(scale, n01));
  var arc    = Arc.New(bz.a0(), Vec2.New(handle), bz.a1());
  return arc;
}
function patch_in_last_point(rootpt, seg) {
  if(seg.isBezier())
    return Bezier.New(seg.a0(), seg.h0(), seg.h1(), rootpt);
  else if(seg.isArc())
    return Arc.New(seg.a0(), seg.h(), rootpt);
}
function path_to_contour(path, EPSILON) {
  if(path.strokeColor) {
    throw new Error('stroked paths are unsupported right now');
  }
  // assume that unstroked paths were intended to be closed
  if(!path.closed) path.closed = true;

  // create a representation of root point
  var p = path.segments[0].point;
  var rootpt = Vec2.New([p.x, p.y]);

  // construct beziers with shared point variables
  var segments = [];
  var prev_anchor = rootpt;
  for(var k=0; k<path.curves.length; k++) {
    var curve = path.curves[k];
    
    // get points
    var p0 = [ curve.point1.x,  curve.point1.y  ];
    var h1 = [ curve.handle1.x, curve.handle1.y ];
    var h2 = [ curve.handle2.x, curve.handle2.y ];
    var p3 = [ curve.point2.x,  curve.point2.y  ];
    var p1 = Vec2.add(p0, h1);
    var p2 = Vec2.add(p3, h2);

    if(is_too_short(p0,p1,p2,p3, EPSILON)) continue;

    var next_anchor = Vec2.New(p3);
    var bz = Bezier.New(prev_anchor,
                        Vec2.New(p1),
                        Vec2.New(p2),
                        next_anchor);
    var arc = extract_arc(p0,p1,p2,p3, h1,h2, bz, EPSILON);

    prev_anchor = next_anchor;
    if(arc) segments.push(arc);
    else    segments.push(bz);
  }
  var Nseg = segments.length;
  if(Nseg === 0) {
    throw new Error('Found Empty Path in input SVG.  Maybe it was too small?');
  }
  segments[Nseg-1] = patch_in_last_point(rootpt, segments[Nseg-1]);

  var cntr = Contour.New(segments);
  return cntr;
}

// take in a paperJS hierarchy and output an array of paper Path objects
function extract_contours(svgitem, EPSILON) {
  switch(svgitem.className) {
  case 'Group':
  case 'CompoundPath':
    // flat map recursively
    return svgitem.children.flatmap(function(c) {
      return extract_contours(c,EPSILON);
    });
  case 'Path':
    return [path_to_contour(svgitem, EPSILON)];
  case 'Shape':
    switch(svgitem.type) {
    case 'circle':
      var center = svgitem.bounds.center;
      return [circle_to_arc_path(center.x, center.y, svgitem.radius)];
    case 'rectangle':
      var bd = svgitem.bounds;
      return [rectangle_to_bz_path(bd.left,bd.top,bd.right,bd.bottom)];
    default:
      throw new Error(
        "Shape type '"+svgitem.type+"' is unsupported by SVGParse.parse()");
    }
  default:
    throw new Error(
      "ClassName '"+svgitem.className+"' is unsupported by SVGParse.parse()");
  } // end switch
}
exports.parse = function(svggroup) {
  // decide on an appropriately small epsilon value for ascertaining equality
  var wh = [svggroup.bounds.width, svggroup.bounds.height];
  // 0.1 px at 1000x1000px display size
  var EPSILON = Math.min(wh[0],wh[1]) * 1.0e-3;
  var contours = extract_contours(svggroup, EPSILON);


  // ensure that all the contours have positive winding
  for(var k=0; k<contours.length; k++)
    if(contours[k].signedArea() < 0)
      contours[k] = contours[k].reverse()

  // then classify each of these contours based on winding
  // w. r. t. other curves
  var total_windings = [];
  for(var i=0; i<contours.length; i++) {
    // pick a point to classify
    var ipt = contours[i].firstSeg().a0().getxy();
    total_windings[i] = 0.0;
    console.log('area', i, contours[i].signedArea() )
    for(var j=0; j<contours.length; j++) {
      if(i != j) {
        total_windings[i] += contours[j].windingNumber(ipt);
        console.log('wind', i, j, contours[j].windingNumber(ipt,true));
      }
    }
  }

  // reverse assuming that we can use an even-odd winding number criterion
  for(var k=0; k<contours.length; k++)
    if(total_windings[k] % 2 != 0)
      contours[k] = contours[k].reverse()

  var pmap = PlanarMap.New(contours);

  return pmap;
}



})(typeof window === 'undefined');
