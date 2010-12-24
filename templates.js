var fs = require('fs');
var utils = require('./utils');

/* Compiled template structure. */

/**
 * The template data structure, which is modeled as a tree of nodes. The
 * templates are parsed into this format and cached for future use.
 */
function Tree(name, pending) {
  this.rootScope = [];
  this.scopeStack = [this.rootScope];
  this.blocks = {};
  this.supertemplate = null;
  this.callbacks = [];
  this.pending = pending ? 2 : 1;
  this.name = name;
}

Tree.DATA = 0;
Tree.VAR = 1;
Tree.IF = 2;
Tree.ELSEIF = 3;
Tree.ELSE = 4;
Tree.BLOCK = 5;

Tree.prototype.addCallback = function(fn) {
  if (this.pending == 0) {
    fn(this);
  } else {
    this.callbacks.unshift(fn);
  }
};

Tree.prototype.executeCallbacks = function() {
  for (var i = 0, callback; callback = this.callbacks[i]; ++i) {
    callback(this);
  }
  this.callbacks = [];
};

Tree.prototype.countup = function() {
  this.pending += 1;
}

Tree.prototype.countdown = function() {
  this.pending -= 1;
  if (this.pending == 0) {
    this.executeCallbacks();
  }
};

/**
 * Retrieves the currently active scope in the tree during compilation.
 */
Tree.prototype.currentScope = function() {
  return this.scopeStack[this.scopeStack.length - 1];
};

/**
 * Creates a new conditional scope and pushes into it.
 */
Tree.prototype.addScope = function(cond, type) {
  var condNode = CondNode(utils.trim(cond), type);
  this.addScopeNode(condNode);
};

/**
 * Pops the top (current) scope off the stack.
 */
Tree.prototype.upScope = function() {
  this.scopeStack.pop();
};

/**
 * Creates a dumb data node and pushes it into the current scope.
 */
Tree.prototype.addData = function(data) {
  this.addNode(DataNode(data));
};

/**
 * Creates a variable node and pushes it into the current scope.
 */
Tree.prototype.addVar = function(v) {
  this.addNode(VarNode(utils.trim(v)));
};

/**
 * Creates a for-loop scope and pushes it to the top of the scope stack.
 */
Tree.prototype.forScope = function(statement) {
  var index = statement.indexOf(' in ');
  if (index == -1) {
    throw 'Must have 'in' keyword in for statement.'
  }
  var variable = utils.trim(statement.substr(0, index));
  var iterable = utils.trim(statement.substr(index + 4));
  var forNode = ForNode(variable, iterable);
  this.addScopeNode(forNode);
};

/**
 * Creates a block scope and pushes it to the top of the scope stack.
 */
Tree.prototype.addBlock = function(name) {
  var blockNode = BlockNode(utils.trim(name));
  this.blocks[blockNode.name] = blockNode;
  this.addScopeNode(blockNode);
};

/**
 * Adds a node to the current scope.
 */
Tree.prototype.addNode = function(node) {
  this.currentScope().push(node);
};

/**
 * Adds a scope node, and pushes it to the top of the scope stack.
 */
Tree.prototype.addScopeNode = function(node) {
  this.currentScope().push(node);
  this.scopeStack.push(node.scope);
};

/**
 * Extends the current template by incrementing the pending operations
 * counter (the extension must occur before compilation is complete) and
 * assigning a callback to the given template.
 */
Tree.prototype.extend = function(name, templates) {
  name = utils.trim(name);
  this.pending += 1;
  templates.getTemplate(name, false, utils.bind(this, function(template) {
    this.extendTemplate(template);
    this.countdown();
  }));
};

/**
 * Extends the template once the supertemplate has loaded by replacing
 * the rootScope with that of the supertemplate and by inheriting any
 * blocks of the supertemplate.
 */
Tree.prototype.extendTemplate = function(template) {
  this.supertemplate = template;
};

/**
 * Gets the block with a given name, traversing up the supertemplates if
 * it isn't found in the current template. Returns null if it cannot
 * find the superblock.
 */
Tree.prototype.getBlock = function(blockName) {
  if (this.blocks[blockName]) {
    return this.blocks[blockName];
  } else if (this.supertemplate) {
    return this.supertemplate.getBlock(blockName);
  }
  return null;
};

Tree.prototype.getRootScope = function() {
  if (this.supertemplate) {
    return this.supertemplate.getRootScope();
  }
  return this.rootScope;
};

/**
 * Data node, which is always displayed if the containing scope is
 * displayed.
 */
function DataNode(data) {
  return {
    'type': Tree.DATA,
    'data': data
  };
}

/**
 * Conditional node, which, based on the type, is displayed if the
 * condition is evaluated to be true.
 */
function CondNode(cond, type) {
  return {
    'type': type,
    'cond': cond,
    'scope': []
  };
}

/**
 * Variable node, which outputs the result of whatever expression is
 * contained.
 */
function VarNode(variable) {
  return {
    'type': Tree.VAR,
    'variable': variable
  };
}

/**
 * For-loop node, which populates the environment with the variable which
 * is assigned, one at a time, the value in the iterable.
 */
function ForNode(variable, iterable) {
  return {
    'type': Tree.FOR,
    'variable': variable,
    'iterable': iterable,
    'scope': []
  };
}

/**
 * Block node, which is used to overwrite sections of text in the
 * supertemplate, if any.
 */
function BlockNode(name) {
  return {
    'type': Tree.BLOCK,
    'name': name,
    'scope': []
  };
}

/**
 * The template object which specifies a directory and maintains a
 * dictionary of templates indexed by name.
 */
function Templates(directory) {
  this.directory = directory;
  this.templates = {};
}

/* Template compilation methods. */

/**
 * Gets a specified template by assigning a callback to that template
 * for whenever the given template has successfully compiled.
 */
Templates.prototype.getTemplate = function(name, pending, callback) {
  var stub = this.templates[name];
  if (stub) {
    if (pending) {
      stub.countup();
    }
    stub.addCallback(callback);
  } else {
    stub = new Tree(name, pending);
    this.templates[name] = stub;
    stub.addCallback(callback);
    this.loadTemplate(name, stub);
  }
  return stub;
};

/**
 * Reads a given template from the file system, injecting the template
 * definition into the provided tree object.
 */
Templates.prototype.loadTemplate = function(name, tree) {
  fs.readFile(this.directory + '/' + name,
              utils.bind(this, function(err, data) {
    if (err) throw err;
    this.compileTemplate(tree, data.toString());
  }));
};

/**
 * Parses a given template file into the tree structure used to evaluate
 * the template.
 */
Templates.prototype.compileTemplate = function(tree, data) {
  var index = 0;
  while (true) {
    var varIndex = data.indexOf('{{', index);
    var condIndex = data.indexOf('{%', index);

    if (varIndex == -1 && condIndex == -1) {
      tree.addData(data.substr(index));
      break;
    } else if (varIndex != -1
               && (condIndex == -1 || varIndex < condIndex)) {
      var closeIndex = data.indexOf('}}', varIndex);
      if (closeIndex == -1) {
        throw 'Opening {{ was not followed by a closing }}.';
      }

      tree.addData(data.substring(index, varIndex));
      tree.addVar(data.substring(varIndex + 2, closeIndex));
      index = closeIndex + 2;
    } else if (condIndex != -1
               && (varIndex == -1 || condIndex < varIndex)) {
      var closeIndex = data.indexOf('%}', condIndex);
      if (closeIndex == -1) {
        throw 'Opening {% was not followed by a closing %}.';
      }

      tree.addData(data.substring(index, condIndex));
      this.handleKeyword(tree, data.substring(condIndex + 2, closeIndex));
      index = closeIndex + 2;
    }
  }
  tree.countdown();
};

/**
 * Parses a given keyword and inserts it into the tree as appropriate.
 */
Templates.prototype.handleKeyword = function(tree, keyword) {
  keyword = utils.trim(keyword);
  if (keyword.substr(0, 2) == 'if') {
    tree.addScope(keyword.substr(2), Tree.IF);
  } else if (keyword.substr(0, 7) == 'else if') {
    tree.upScope();
    tree.addScope(keyword.substr(7), Tree.ELSEIF);
  } else if (keyword.substr(0, 4) == 'else') {
    tree.upScope();
    tree.addScope('', Tree.ELSE);
  } else if (keyword == 'endif') {
    tree.upScope();
  } else if (keyword.substr(0, 3) == 'for') {
    tree.forScope(keyword.substr(3));
  } else if (keyword.substr(0, 6) == 'endfor') {
    tree.upScope();
  } else if (keyword.substr(0, 5) == 'block') {
    tree.addBlock(keyword.substr(5));
  } else if (keyword.substr(0, 8) == 'endblock') {
    tree.upScope();
  } else if (keyword.substr(0, 7) == 'extends') {
    tree.extend(keyword.substr(7), this);
  }
};

/* Template rendering methods. */

/**
 * Renders a given template with the provided variables, and calls
 * the given callback with the rendered response.
 */
Templates.prototype.render = function(name, vars, callback) {
  this.getTemplate(name, false, utils.bind(this, function(template) {
    callback(this.renderTemplate(template, vars));
  }));
};

/**
 * Gets a render handle on the template with an additional pending
 * count, so that other asynchronous operations can complete before
 * render time. Also returns a stub of the template so that countdown
 * operations can be performed as the asynchronous operations complete.
 */
Templates.prototype.renderPending = function(name, vars, callback) {
  return this.getTemplate(name, true, utils.bind(this, function(template) {
    callback(this.renderTemplate(template, vars));
  }));
};

/**
 * Renders the loaded template with the given variables.
 */
Templates.prototype.renderTemplate = function(template, vars) {
  var result = {'output': ''};
  this.renderScope(result,
                   template.getRootScope(),
                   this.getVarScope(vars),
                   template);
  return result;
};

/**
 * Renders a scope with a given variable scope and inserts the results
 * into the given results object.
 */
Templates.prototype.renderScope = function(result, scope, varscope, template) {
  var conditionMet = true;
  for (var i = 0, item; item = scope[i]; ++i) {
    switch (item.type) {
      case Tree.DATA:
        result.output += item.data;
        break;
      case Tree.VAR:
        result.output += varscope.eval(item.variable);
        break;
      case Tree.IF:
        if (varscope.eval(item.cond)) {
          conditionMet = true;
          this.renderScope(result, item.scope, varscope, template);
        } else {
          conditionMet = false;
        }
        break;
      case Tree.ELSEIF:
        if (!conditionMet && varscope.eval(item.cond)) {
          conditionMet = true;
          this.renderScope(result, item.scope, varscope, template);
        }
        break;
      case Tree.ELSE:
        if (!conditionMet) {
          conditionMet = true;
          this.renderScope(result, item.scope, varscope, template);
        }
        break;
      case Tree.FOR:
        this.renderFor(result, item, varscope, template);
        break;
      case Tree.BLOCK:
        var blockScope = template.getBlock(item.name).scope;
        this.renderScope(result, blockScope, varscope, template);
        break;
    }
  }
};

Templates.prototype.renderFor = function(result, forItem, varscope, template) {
  var iterable = varscope.eval(forItem.iterable);
  for (var i = 0, item; item = iterable[i]; ++i) {
    var forVars = {};
    forVars[forItem.variable] = item;
    var newVarscope = varscope.extend(forVars);
    this.renderScope(result, forItem.scope, newVarscope, template);
  }
};

Templates.prototype.getVarScope = function(_vars) {
  var evals = '';
  for (var v in _vars) {
    if (v == '_vars') {
      throw 'Must not use keyword _vars in template variables.';
    }
    evals += 'var ' + v + ' = _vars["' + v + '"];';
  }
  eval(evals);
  
  var that = this;
  function evaluate(statement) {
    try {
      eval('var result = (' + statement + ');');
      return result;
    } catch (e) {
      return undefined;
    }
  }
  function extend(_newVars) {
    for (var i in _vars) {
      if (!_newVars[i]) {
        _newVars[i] = _vars[i];
      }
    }
    return that.getVarScope(_newVars);
  }
  return {
    'eval': evaluate,
    'extend': extend
  };
};

/* Debugging methods. */

Tree.prototype.printScope = function(scope, tab) {
  for (var i = 0, item; item = scope[i]; ++i) {
    var tabStr = '';
    for (var t = 0; t < tab; ++t) {
      tabStr += ' ';
    }
    switch (item.type) {
      case Tree.DATA:
        console.log(tabStr + 'DATA:' + item.data);
        break;
      case Tree.VAR:
        console.log(tabStr + 'VAR:' + item.variable);
        break;
      case Tree.IF:
        console.log(tabStr + 'IF:' + item.cond);
        this.printScope(item.scope, tab + 2);
        break;
      case Tree.ELSEIF:
        console.log(tabStr + 'ELSEIF:' + item.cond);
        this.printScope(item.scope, tab + 2);
        break;
      case Tree.ELSE:
        console.log(tabStr + 'ELSE:' + item.cond);
        this.printScope(item.scope, tab + 2);
        break;
      case Tree.FOR:
        console.log(tabStr + 'FOR: ' + item.variable + ' in ' +
                    item.iterable);
        this.printScope(item.scope, tab + 2);
        break;
      case Tree.BLOCK:
        console.log(tabStr + 'BLOCK ' + item.name + ':');
        this.printScope(this.getBlock(item.name).scope, tab + 2);
        break;
    }
  }
};

exports.Templates = Templates;
