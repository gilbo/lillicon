

(function(on_node){
var exports = on_node? module.exports : window['emtriangle']={};



// modules
if(on_node) {
  var libtriangle = require('./libtriangle.js')
  var emlib       = libtriangle; // alias for emscripten functions
} else {
  var libtriangle = Module;
  var emlib       = libtriangle;
  if(!libtriangle)
    throw new Error(
      "Must have libtriangle loaded before emtriangle");
}







// ********        ********        ********
//  BEGIN C-Struct / Data Interface Code

// get sizes and sanity check them
var intsize           = libtriangle._sizeof_int();
var doublesize        = libtriangle._sizeof_double();
var triangulateiosize = libtriangle._sizeof_triangulateio();
var charptrsize       = libtriangle._sizeof_char_ptr();
var voidptrsize       = libtriangle._sizeof_void_ptr();
// make sure pointer sizes are consistent
if(charptrsize !== voidptrsize)
  throw new Error('Inconsistent Pointer Sizes Detected\n'+
                  '  charptrsize: '+charptrsize+'\n'+
                  '  voidptrsize: '+voidptrsize);
// and canonicalize the pointer sizes
var ptrsize = voidptrsize;
// make sure that doubles take 8 bytes
if(doublesize !== 8)
  throw new Error('doubles have a different size than 8 bytes.  '+
                  'Something is horribly wrong and non-standard');
// make sure that ints take 4 bytes
if(intsize !== 4)
  throw new Error('ints have a different size than 4 bytes.  '+
                  'We rely on a 4 byte assumption right now.');


var CArray = {};
function carray_create_common(type, size) {
  var obj = Object.create(CArray);

  obj._size = size;
  obj._type = type;
  switch(type) {
    case 'double*':
    case 'int*':
      obj._emtype   = '*';
      obj._elemsize = ptrsize;
      break;
    case 'char':
      obj._emtype   = 'i8';
      obj._elemsize = 1;
      break;
    case 'int':
      obj._emtype   = 'i32'; // relies on 4 byte assumption
      obj._elemsize = intsize;
      break;
    case 'double':
      obj._emtype   = 'double';
      obj._elemsize = doublesize;
      break;
    default:
      throw new Error('Unrecognized array element type: '+type);
  }

  obj._bytes = obj._size * obj._elemsize;
  return obj;
}
CArray.alloc = function(type, size) {
  var obj = carray_create_common(type, size);

  obj._ptr = emlib._malloc(obj._bytes);

  return obj;
}
CArray.fromptr = function(ptr, type, size) {
  var obj = carray_create_common(type, size);

  obj._ptr = ptr;

  return obj;
}
CArray.get = function(i) {
  var type    = this._emtype;
  var offset  = i * this._elemsize;
  var val     = emlib.getValue(this._ptr + offset, type);
  return val;
}
CArray.set = function(i, val) {
  var type    = this._emtype;
  var offset  = i * this._elemsize;
  emlib.setValue(this._ptr + offset, val, type);
}
CArray.size = function() { return this._size; }
CArray.getptr = function() { return this._ptr; }
CArray.free = function() {
  emlib._free(this._ptr);
  this._ptr = 0;
}

var CStruct = {};
var struct_blacklist = [
  'compile',
  'sizeof',
  'alloc',
  'getptr',
  'free',
  '_description',
  '_data',
  '_sizeof',
  '_ptr',
];
CStruct.compile = function(description) {
  var newstruct = Object.create(CStruct);

  newstruct._description = description;
  newstruct._data = {};

  var byte_offset = 0;
  for (var name in description) {
    if(struct_blacklist[name]) {
      throw new Error('Cannot use field name for struct; name conflict:\n'+
                      '    '+name);
    }
    var data = (newstruct._data[name] = {});
    var type = (data.orig_type = description[name]);

    switch(type) {
    case 'double*':
    case 'int*':
      data.emtype = '*';
      data.offset = byte_offset;
      byte_offset += ptrsize;
      break;
    case 'int':
      data.emtype = 'i32'; // relies on 4 byte assumption
      data.offset = byte_offset;
      byte_offset += intsize;
      break;
    case 'double':
      data.emtype = 'double';
      data.offset = byte_offset;
      byte_offset += doublesize;
      break;
    default:
      throw new Error('Unrecognized struct field type: '+type);
    }
  }

  newstruct._sizeof = byte_offset;
  return newstruct
}
CStruct.sizeof = function() {
  return this._sizeof;
}
CStruct.alloc = function() {
  var obj = Object.create(this);

  var ptr = (obj._ptr = emlib._malloc(this._sizeof));

  var getsets = {};
  for (var name in this._data) {
    (function(type, offset) {
      var getter = function() {
        var val = emlib.getValue(ptr+offset, type);
        //console.log('get', name, ptr, offset, val, type);
        return val;
      };
      var setter = function(val) {
        emlib.setValue(ptr+offset, val, type);
        //console.log('set', name, ptr, offset, val, type);
      };
      getsets[name] = { get: getter, set: setter };
    })(this._data[name].emtype, this._data[name].offset);
  }
  Object.defineProperties(obj, getsets);

  return Object.seal(obj);
}
CStruct.getptr = function() {
  return this._ptr;
}
CStruct.free = function() {
  emlib._free(this._ptr);
  this._ptr = 0;
}

//  END   C-Struct / Data Interface Code
// ********        ********        ********



var IOStruct = CStruct.compile({
  'pointlist':                    'double*',
  'pointattributelist':           'double*',
  'pointmarkerlist':              'int*',
  'numberofpoints':               'int',
  'numberofpointattributes':      'int',

  'trianglelist':                 'int*',
  'triangleattributelist':        'double*',
  'trianglearealist':             'double*',
  'neighborlist':                 'int*',
  'numberoftriangles':            'int',
  'numberofcorners':              'int',
  'numberoftriangleattributes':   'int',

  'segmentlist':                  'int*',
  'segmentmarkerlist':            'int*',
  'numberofsegments':             'int',

  'holelist':                     'double*',
  'numberofholes':                'int',

  'regionlist':                   'double*',
  'numberofregions':              'int',

  'edgelist':                     'int*',
  'edgemarkerlist':               'int*',
  'normlist':                     'double*',
  'numberofedges':                'int',
});
// Sanity check the struct size
(function(){
  if(IOStruct.sizeof() !== triangulateiosize)
    throw new Error('Inconsistent struct triangulateio sizes computed.\n'+
                    '  C sizeof: '+triangulateiosize+'\n'+
                    '  JS count: '+IOStruct.sizeof());
})();

function trilibfree_zero(obj,field) {
  console.log('freeing', field);
  libtriangle._trifree(obj[field]);
  obj[field] = 0;
}
function trilibfree_arrays(io) {
  if(io.pointlist)              trilibfree_zero(io, 'pointlist');
  if(io.pointattributelist)     trilibfree_zero(io, 'pointattributelist');
  if(io.pointmarkerlist)        trilibfree_zero(io, 'pointmarkerlist');

  if(io.trianglelist)           trilibfree_zero(io, 'trianglelist');
  if(io.triangleattributelist)  trilibfree_zero(io, 'triangleattributelist');
  if(io.trianglearealist)       trilibfree_zero(io, 'trianglearealist');
  if(io.neighborlist)           trilibfree_zero(io, 'neighborlist');

  if(io.segmentlist)            trilibfree_zero(io, 'segmentlist');
  if(io.segmentmarkerlist)      trilibfree_zero(io, 'segmentmarkerlist');

  if(io.holelist)               trilibfree_zero(io, 'holelist');

  if(io.regionlist)             trilibfree_zero(io, 'regionlist');

  if(io.edgelist)               trilibfree_zero(io, 'edgelist');
  if(io.edgemarkerlist)         trilibfree_zero(io, 'edgemarkerlist');
  if(io.normlist)               trilibfree_zero(io, 'normlist');
}

function zero_iostruct(io) {
  for(var name in io._data) {
    io[name] = 0;
  }
}

function dumptriio(io) {
  for(var name in io._data) {
    var padding = '';
    for(var k=0; k<(30 - name.length); k++) padding += ' ';
    console.log(name+padding, io[name]);
  }
}





function do_triangulation(points, edges, hole_points) {
  //var stack_ptr = emlib.Runtime.stackSave();

  var n_points  = points.length;
  var n_edges   = edges.length;
  var n_holes   = (hole_points)? hole_points.length : 0;


// ********************
//  Prepare Input Data
  var xys   = CArray.alloc('double', 2 * n_points);
  var segs  = CArray.alloc('int',    2 * n_edges);
  for(var k=0; k<n_points; k++) {
    xys.set(2*k+0, points[k][0]);
    xys.set(2*k+1, points[k][1]);
  }
  for(var k=0; k<n_edges; k++) {
    segs.set(2*k+0, edges[k][0]);
    segs.set(2*k+1, edges[k][1]);
  }
  var holes = null;
  if(hole_points) {
    holes   = CArray.alloc('double', 2 * n_holes);
    for(var k=0; k<n_holes; k++) {
      holes.set(2*k+0, hole_points[k][0]);
      holes.set(2*k+1, hole_points[k][1]);
    }
  }


// ***********************
//  Setup Input Structure
  var input = IOStruct.alloc();
  zero_iostruct(input);
  input.numberofpoints    = n_points;
  input.pointlist         = xys.getptr();
  input.numberofsegments  = n_edges;
  input.segmentlist       = segs.getptr();
  input.numberofholes     = n_holes;
  if(holes)
    input.holes           = holes.getptr();
  //dumptriio(input);


// ************************
//  Setup Output Structure
  var output = IOStruct.alloc();
  zero_iostruct(output)
  //dumptriio(output);


// ****************
//  EXECUTION CALL
  // if not using qauDjs then input and output points should be identical
  // do not need to use opts: iFsC rqauDYSs
  var cmd_opt_str = 'pzNYY';
  // zero indexing, no (boundary markers/) nodes output
  // quiet it down
  //cmd_opt_str = cmd_opt_str + 'Q';
  var cmd_opt_str_arr = CArray.alloc('char',cmd_opt_str.length+1);
  emlib.writeStringToMemory(cmd_opt_str, cmd_opt_str_arr.getptr());

  var cmd_opt_str_ptr = cmd_opt_str_arr.getptr();
  var input_ptr       = input.getptr();
  var output_ptr      = output.getptr();
  var null_ptr        = 0;
//console.log(cmd_opt_str_ptr, input_ptr, output_ptr, null_ptr);
//console.log(String.fromCharCode(emlib.getValue(cmd_opt_str_ptr + 0, 'i8')));
//console.log(String.fromCharCode(emlib.getValue(cmd_opt_str_ptr + 1, 'i8')));
//console.log(String.fromCharCode(emlib.getValue(cmd_opt_str_ptr + 2, 'i8')));
//console.log(String.fromCharCode(emlib.getValue(cmd_opt_str_ptr + 3, 'i8')));
//console.log(String.fromCharCode(emlib.getValue(cmd_opt_str_ptr + 4, 'i8')));
//console.log(emlib.getValue(cmd_opt_str_ptr + 5, 'i8'));

  // DOES THIS NEED TO USE CCALL?
  libtriangle._triangulate(
    cmd_opt_str_ptr,
    input_ptr,
    output_ptr,
    null_ptr
  );

  cmd_opt_str_arr.free();


// ****************
//  Extract Output
  var tris = [];

  if(output.numberofcorners !== 3) {
    console.log('ERROR: WEIRD # OF CORNERS');
  } else {
    var ts = CArray.fromptr(output.trianglelist,
                            'int',
                            output.numberoftriangles);
    for(var k=0; k<output.numberoftriangles; k++) {
      tris[k] = [
        ts.get(3*k + 0),
        ts.get(3*k + 1),
        ts.get(3*k + 2),
      ];
    }
  }


// ***********
//  Free Data
  
  // zero hole pointer before free-ing because it was copied over
  output.holelist = 0;
  output.numberofholes = 0;

  trilibfree_arrays(output);

  output.free();
  input.free();

  if(holes) holes.free();
  segs.free();
  xys.free();

  //emlib.Runtime.stackRestore(stack_ptr);
  return tris;
}

var points = [
  [0,0],
  [1,0],
  [1,1],
  [0,1],
];

var edges = [
  [0,1],
  [1,2],
  [2,3],
  [3,0],
];

//var result = do_triangulation(points, edges);
//console.log(result);

exports.triangulate = do_triangulation;







})(typeof window === 'undefined');





