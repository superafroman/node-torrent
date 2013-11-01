var File = require('../file')
  , fs = require('fs')
  , path = require('path')
  , ProcessUtils = require('../util/processutils')
  ;

var LOGGER = require('log4js').getLogger('createfiles.js');

/**
 * Create files defined in the given metadata.
 */
function createFiles(downloadPath, metadata, callback) {
  
  var basePath = path.join(downloadPath, metadata.name);

  if (metadata.length) {
      var file = new File(basePath, metadata.length, null, function(error) {
        if (error) {
          callback(new Error('Error creating file, error = ' + error));
        } else {
          callback(null, [file], metadata.length);
        }
      });
  } else {
    makeDirectory(basePath, function(error) {
      if (error) {
        callback(error);
      } else {
        nextFile(basePath, metadata.files, [], 0, callback);
      }
    });
  }
}

function nextFile(basePath, files, processedFiles, offset, callback) {
  if (files.length === 0) {
    callback(null, processedFiles, offset);
  } else {
    var file = files.shift()
      , pathArray = file.path.slice(0)
      ;
    checkPath(basePath, pathArray, function(error, filePath) {
      if (error) {
        callback(error);
      } else {
        processedFiles.push(new File(path.join(filePath, pathArray[0]), file.length, 
            offset, function(error) {
          if (error) {
            callback(new Error('Error creating file, error = ' + error));
          } else {
            offset += file.length;
            ProcessUtils.nextTick(function() {
              nextFile(basePath, files, processedFiles, offset, callback);
            });
          }
        }));
      }
    });
  }
}

function checkPath(basePath, pathArray, callback) {
  if (pathArray.length === 1) {
    callback(null, basePath);
  } else {
    var currentPath = path.join(basePath, pathArray.shift());
    makeDirectory(currentPath, function(error) {
      if (error) {
        callback(error);
      } else {
        checkPath(currentPath, pathArray, callback);
      }
    });
  }
}

function makeDirectory(path, callback) {
  fs.exists(path, function(pathExists) {
    if (!pathExists) {
      fs.mkdir(path, 0777, function(error) {
        if (error) {
          return callback(new Error("Couldn't create directory. error = " + error));
        }
        callback(null);
      });
    } else {
      callback(null);
    }
  });
}

module.exports = exports = createFiles;
