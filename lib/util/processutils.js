
function nextTick(callback) {
  //process.nextTick(callback);
  setTimeout(callback, 0);
}

exports.nextTick = nextTick;