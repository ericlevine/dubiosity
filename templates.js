var fs = require('fs');
var utils = require('./utils');

function Tree() {
  this.rootScope = [];
  this.scopeStack = [this.rootScope];
}

Tree.DATA = 0;
Tree.VAR = 1;
Tree.IF = 2;
Tree.ELSEIF = 3;
Tree.ELSE = 4;

Tree.prototype.currentScope = function() {
  return this.scopeStack[this.scopeStack.length - 1];
};

Tree.prototype.addScope = function(cond, type) {
  var condNode = CondNode(utils.trim(cond), type);
  this.currentScope().push(condNode);
  this.scopeStack.push(condNode.scope);
};

Tree.prototype.upScope = function() {
  this.scopeStack.pop();
};

Tree.prototype.addData = function(data) {
  this.currentScope().push(DataNode(data));
};

Tree.prototype.addVar = function(v) {
  this.currentScope().push(VarNode(utils.trim(v)));
};

function DataNode(data) {
  return {
    'type': Tree.DATA,
    'data': data
  };
}

function CondNode(cond, type) {
  return {
    'type': type,
    'cond': cond,
    'scope': []
  };
}

function VarNode(v) {
  return {
    'type': Tree.VAR,
    'variable': v
  };
}

function Templates(directory) {
  this.directory = directory;
  this.templates = {};
}

Templates.prototype.render = function(name, vars, callback) {
  var result;
  if (this.templates[name]) {
    callback(this.renderTemplate(this.templates[name], vars));
  } else {
    fs.readFile(this.directory + '/' + name,
                utils.bind(this, function(err, data) {
      if (err) throw err;
      this.compileTemplate(name, data.toString());
      callback(this.renderTemplate(this.templates[name], vars));
    }));
  }
};

Templates.prototype.renderTemplate = function(template, vars) {
  var result = {'output': ''};
  this.renderScope(result, template.rootScope, this.getVarScope(vars));
  return result;
};

Templates.prototype.renderScope = function(result, scope, varscope) {
  var conditionMet = true;
  for (var i = 0, item; item = scope[i]; ++i) {
    switch (item.type) {
      case Tree.DATA:
        result.output += item.data;
        break;
      case Tree.VAR:
        result.output += varscope(item.variable);
        break;
      case Tree.IF:
        if (varscope(item.cond)) {
          conditionMet = true;
          this.renderScope(result, item.scope, varscope);
        } else {
          conditionMet = false;
        }
        break;
      case Tree.ELSEIF:
        if (!conditionMet && varscope(item.cond)) {
          conditionMet = true;
          this.renderScope(result, item.scope, varscope);
        }
        break;
      case Tree.ELSE:
        if (!conditionMet) {
          conditionMet = true;
          this.renderScope(result, item.scope, varscope);
        }
        break;
    }
  }
};

Templates.prototype.getVarScope = function(vars) {
  var evals = '';
  for (var v in vars) {
    var value = (typeof vars[v] == 'string') ? 
                 '"' + vars[v] + '"' :
                 vars[v];
    evals += 'var ' + v + ' = ' + value + ';';
  }
  eval(evals);
  
  function varscope(statement) {
    eval('var result = (' + statement + ');');
    return result;
  }
  return varscope;
};

Templates.prototype.compileTemplate = function(name, data) {
  var index = 0;
  var tree = new Tree();
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
        throw "Opening {{ was not followed by a closing }}.";
      }

      tree.addData(data.substring(index, varIndex));
      tree.addVar(data.substring(varIndex + 2, closeIndex));
      index = closeIndex + 2;
    } else if (condIndex != -1
               && (varIndex == -1 || condIndex < varIndex)) {
      var closeIndex = data.indexOf('%}', condIndex);
      if (closeIndex == -1) {
        throw "Opening {% was not followed by a closing %}.";
      }

      tree.addData(data.substring(index, condIndex));
      this.handleCond(tree, data.substring(condIndex + 2, closeIndex));
      index = closeIndex + 2;
    }
  }
  this.templates[name] = tree;
};

Templates.prototype.handleCond = function(tree, cond) {
  cond = utils.trim(cond);
  if (cond.substr(0, 2) == 'if') {
    tree.addScope(cond.substr(2), Tree.IF);
  } else if (cond.substr(0, 7) == 'else if') {
    tree.upScope();
    tree.addScope(cond.substr(7), Tree.ELSEIF);
  } else if (cond.substr(0, 4) == 'else') {
    tree.upScope();
    tree.addScope('', Tree.ELSE);
  } else if (cond == 'endif') {
    tree.upScope();
  }
};

Templates.prototype.printScope = function(scope, tab) {
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
    }
  }
};

exports.Templates = Templates;
