/*  
 *  uibureau.js
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
var exports = on_node? module.exports : window['uibureau']={};

// UI BUREAU
//  is a logging / history / undo module
//  Ask the bureau to do things for you and the bureau will
//  keep track of what happened, plus how to undo it.

// modules
if(on_node) {
  var uiaction    = require('./uiaction');
//  var primitives  = require('./primitives');
//  var contours    = require('./contours');
//  var planarmap   = require('./planarmap');
//  var constraints = require('./constraints');
//  var numeric_subroutines = require('./numeric_subroutines');
} else {
  var uiaction    = window.uiaction;
//  var primitives  = window.primitives;
//  var contours    = window.contours;
//  var planarmap   = window.planarmap;
//  var constraints = window.constraints;
//  var numeric_subroutines = window.numeric_subroutines;
  if(!uiaction)
    throw new Error("Must have UIAction Module loaded before Bureau");
}

// IMPORTS





// DECLARATIONS
var Bureau = (exports.Bureau = {});




// manage the undo stack
function push_action_stack(bureau, obj) {
  bureau.action_stack.push(obj);
  if(bureau.action_stack.length > bureau.history_depth)
    bureau.action_stack.shift();
}
function pop_action_stack(bureau) {
  // otherwise, actually pop
  var recent_action = bureau.action_stack.pop();
  return recent_action;
}



// IMPLEMENTATIONS
Bureau.New = function(doc, params) {
  params = params || {};
  var b = Object.create(Bureau);
  b.history_depth = params.history_depth || 50; // default
  b.action_stack = [];
  b.event_log = [];
  b.timevals = {
    perf_start: performance.now(),
    unix_epoch_start: Date.now(),
  }
  b.logentry('START_LOG '+JSON.stringify({
    timevals: b.timevals,
    datetime: new Date(),
  }));
  b.main_workspace = params.workspace;
  return b;
}
Bureau.setWorkspace = function(wkspc) {
  this.main_workspace = wkspc;
}


var whitespace_padding = [];
var space_temp = '';
for(var k=0; k<20; k++) {
  whitespace_padding[k] = space_temp;
  space_temp = space_temp + ' ';
}
Bureau.logentry = function(txt) {
  var timestamp = performance.now() - this.timevals.perf_start;
  timestamp = String(timestamp);
  var npad = Math.max(0, 20-timestamp.length);
  var prefix = timestamp + ': ' + whitespace_padding[npad];
  this.event_log.push(prefix+txt+'\n');
}
Bureau.getLog = function() {
  this.logentry('GET_LOG '+JSON.stringify({
    datetime: new Date(),
  }));
  return this.event_log;
}


//function record_event(bureau, event_data) {
//  bureau.event_log.push({
//    timestamp: performance.now() - bureau.timevals.perf_start,
//    event_data: event_data,
//  });
//}


Bureau.doAction = function(action, params) {
  if(this._action_in_progress)
    throw new Error('cannot interrupt action in progress with a new action');
  if(action.undo)
    push_action_stack(this, action);
  var logmsg = action.donow(params);
  if(logmsg) this.logentry(logmsg);
}
Bureau.startAction = function(action, params) {
  if(this._action_in_progress)
    throw new Error('cannot interrupt action in progress with a new action');
  if(action.undo)
    push_action_stack(this, action);
  this._action_in_progress = action;
  var logmsg = action.dostart(params);
  if(logmsg) this.logentry(logmsg);
}
Bureau.continueAction = function(params) {
  if(!this._action_in_progress)
    throw new Error('no action in progress to continue');
  var logmsg = this._action_in_progress.docontinue(params);
  if(logmsg) this.logentry(logmsg);
}
Bureau.endAction = function(params) {
  if(!this._action_in_progress)
    throw new Error('no action in progress to end');
  var logmsg = this._action_in_progress.doend(params);
  if(logmsg) this.logentry(logmsg);
  delete this._action_in_progress;
}

Bureau.undo = function() {
  if(this.action_stack.length <= 0) return;
  if(this._action_in_progress)
    throw new Error('Cannot undo while in the middle of an action');

  var top = pop_action_stack(this);
  top.undo();
  this.logentry('UNDO');
}




















})(typeof window === 'undefined');
