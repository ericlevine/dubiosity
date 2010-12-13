exports.bind = function(scope, fn) {
  return function() {
    fn.apply(scope, arguments);
  }
};

exports.trim = function(str) {
  var len = str.length;
  var start = 0, end = len - 1;
  while (start < len && str.charAt(start) == ' ') {
    ++start;
  }
  while (end > 0 && str.charAt(end) == ' ') {
    --end;
  }
  return str.substring(start, end + 1);
};
