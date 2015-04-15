var path = require('path');

var Metalsmith = require('metalsmith');
var handlebars = require('handlebars');
var templates = require('metalsmith-templates');
var marked = require('marked');
var pkg = require('../package.json');

var markupRegEx = /([^\/^\.]*)\.html$/;
var cleanupJSRegEx = /.*(goog\.require(.*);|.*renderer: exampleNS\..*,?)[\n]*/g;
var isCssRegEx = /\.css$/;
var isJsRegEx = /\.js$/;

var srcDir = path.join(__dirname, '..', 'examples');
var destDir = path.join(__dirname, '..', 'build', 'examples');
var templatesDir = path.join(__dirname, '..', 'config', 'examples');

/**
 * A Metalsmith plugin that adds metadata to the example HTML files.  For each
 * example HTML file, this adds metadata for related js and css resources. When
 * these files are run through the example template, the extra metadata is used
 * to show the complete example source in the textarea and submit the parts to
 * jsFiddle.
 *
 * @param {Object} files The file lookup provided by Metalsmith.  Property names
 *     are file paths relative to the source directory.  The file objects
 *     include any existing metadata (e.g. from YAML front-matter), the file
 *     contents, and stats.
 * @param {Object} metalsmith The metalsmith instance the plugin is being used
 *     with.
 * @param {function(Error)} done Called when done (with any error).
 */
function augmentExamples(files, metalsmith, done) {
  setImmediate(done); // all remaining code is synchronous
  for (var filename in files) {
    var file = files[filename];
    var match = filename.match(markupRegEx);
    if (match && filename !== 'index.html') {
      if (!file.template) {
        throw new Error(filename + ': Missing template in YAML front-matter');
      }
      var id = match[1];

      // add js tag and source
      var jsFilename = id + '.js';
      if (!(jsFilename in files)) {
        throw new Error('No .js file found for ' + filename);
      }
      file.js = {
        tag: '<script src="loader.js?id=' + id + '"></script>',
        source: files[jsFilename].contents.toString().replace(
            cleanupJSRegEx, '')
      };

      // add css tag and source
      var cssFilename = id + '.css';
      if (cssFilename in files) {
        file.css = {
          tag: '<link rel="stylesheet" href="' + cssFilename + '">',
          source: files[cssFilename].contents.toString()
        };
      }

      // add additional resources
      if (file.resources) {
        var resources = [];
        for (var i = 0, ii = file.resources.length; i < ii; ++i) {
          var resource = file.resources[i];
          if (isJsRegEx.test(resource)) {
            resources[i] = '<script src="' + resource + '"></script>';
          } else if (isCssRegEx.test(resource)) {
            resources[i] = '<link rel="stylesheet" href="' + resource + '">';
          } else {
            throw new Error('Invalid value for resource: ' +
                resource + ' is not .js or .css: ' + filename);
          }
        }
        file.extraHead = resources.join('\n');
      }
    }
  }
}

/**
 * Create an inverted index of keywords from examples.  Property names are
 * lowercased words.  Property values are objects mapping example index to word
 * count.
 * @param {Array.<Object>} exampleInfos Array of example info objects.
 * @return {Object} Word index.
 */
function createWordIndex(exampleInfos) {
  var index = {};
  var keys = ['shortdesc', 'title', 'tags'];
  exampleInfos.forEach(function(info, i) {
    keys.forEach(function(key) {
      var text = info[key];
      var words = text ? text.split(/\W+/) : [];
      words.forEach(function(word) {
        if (word) {
          word = word.toLowerCase();
          var counts = index[word];
          if (counts) {
            if (index in counts) {
              counts[i] += 1;
            } else {
              counts[i] = 1;
            }
          } else {
            counts = {};
            counts[i] = 1;
            index[word] = counts;
          }
        }
      });
    });
  });
  return index;
}

/**
 * A plugin that generates the example index.js file.  This file includes a
 * list of example metadata objects and a word index used when searching for
 * examples.
 * @param {Object} files The file lookup provided by Metalsmith.  Property names
 *     are file paths relative to the source directory.  The file objects
 *     include any existing metadata (e.g. from YAML front-matter), the file
 *     contents, and stats.
 * @param {Object} metalsmith The metalsmith instance the plugin is being used
 *     with.
 * @param {function(Error)} done Called when done (with any error).
 */
function createIndex(files, metalsmith, done) {
  setImmediate(done); // all remaining code is synchronous
  var exampleInfos = [];
  for (var filename in files) {
    var example = files[filename];
    if (markupRegEx.test(filename)) {
      exampleInfos.push({
        link: filename,
        example: filename,
        title: example.title,
        shortdesc: example.shortdesc,
        tags: example.tags
      });
    }
  }
  var info = {
    examples: exampleInfos,
    index: createWordIndex(exampleInfos)
  };
  files['index.js'] = {
    contents: new Buffer('var info = ' + JSON.stringify(info)),
    mode: '0644'
  };
}

function main(callback) {
  var smith = new Metalsmith('.')
      .source(srcDir)
      .destination(destDir)
      .concurrency(25)
      .metadata({
        olVersion: pkg.version
      })
      .use(augmentExamples)
      .use(createIndex)
      .use(templates({
        engine: 'handlebars',
        directory: templatesDir,
        helpers: {
          md: function(str) {
            return new handlebars.SafeString(marked(str));
          }
        }
      }))
      .build(function(err) {
        callback(err);
      });
  return smith;
}

if (require.main === module) {
  main(function(err) {
    if (err) {
      process.stderr.write(
          'Building examples failed.  See the full trace below.\n\n' +
          err.stack + '\n');
      process.exit(1);
    } else {
      process.exit(0);
    }
  });
}

module.exports = main;
