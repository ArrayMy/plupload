/* global jake:true, desc:true, task:true, complete:true, require:true, console:true, process:true */
/* jshint unused:false */
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var tools = require('./build/BuildTools');
var less = tools.less;
var yuidoc = tools.yuidoc;
var jshint = tools.jshint;
var zip = tools.zip;

var utils = require('./src/moxie/build/utils');
var wiki = require('./src/moxie/build/wiki');


function exit(message) {
	if (message) {
		console.info(message);
	}
	complete();
	process.exit(arguments[1] || 0);
}


desc("Default build task");
task("default", ["mkjs", "docs"], function (params) {});



desc("Build release package");
task("release", ["default", "package"], function (params) {});



desc("Build mOxie");
task("moxie", [], function (params) {
	var moxieDir = "src/moxie";
	exec("cd " + moxieDir + "; jake lib; cd ../..;", function(error, stdout, stderr) {
		if (!error) {
			complete();
		} else {
			exit("mOxie: Build process failed.", 1);
		}
	});
}, true);



desc("Minify JS files");
task("mkjs", [], function (params) {
	var targetDir = "./js", moxieDir = "src/moxie";
	
	// Clear previous versions
	if (path.existsSync(targetDir)) {
		jake.rmRf(targetDir);
	}
	fs.mkdirSync(targetDir, 0755);

	// Include Plupload source
	tools.copySync('./src/plupload.js', "js/plupload.dev.js");

	// Instrument Plupload code
	fs.writeFileSync(targetDir + '/plupload.cov.js', new Instrument(fs.readFileSync('./src/plupload.js').toString(), {
		name: 'Plupload'
	}).instrument());
	

	// Copy compiled moxie files
	tools.copySync(moxieDir + "/bin/flash/Moxie.swf", "js/Moxie.swf");
	tools.copySync(moxieDir + "/bin/silverlight/Moxie.xap", "js/Moxie.xap");
	tools.copySync(moxieDir + "/bin/js/moxie.min.js", "js/moxie.min.js");
	tools.copySync(moxieDir + "/bin/js/moxie.js", "js/moxie.js");

	// Copy UI Plupload
	jake.cpR("./src/jquery.ui.plupload", targetDir + "/jquery.ui.plupload", {});

	uglify([
		'jquery.ui.plupload.js'
	], targetDir + "/jquery.ui.plupload/jquery.ui.plupload.min.js", {
		sourceBase: targetDir + "/jquery.ui.plupload/"
	});

	// Copy Queue Plupload
	jake.cpR("./src/jquery.plupload.queue", targetDir + "/jquery.plupload.queue", {});

	uglify([
		'jquery.plupload.queue.js'
	], targetDir + "/jquery.plupload.queue/jquery.plupload.queue.min.js", {
		sourceBase: targetDir + "/jquery.plupload.queue/"
	});

	// Minify Plupload and combine with mOxie
	uglify([
		'plupload.js'
	], targetDir + "/plupload.min.js", {
		sourceBase: 'src/'
	});

	var releaseInfo = tools.getReleaseInfo("./changelog.txt");
	tools.addReleaseDetailsTo(targetDir + "/plupload.dev.js", releaseInfo);
	tools.addReleaseDetailsTo(targetDir + "/plupload.min.js", releaseInfo);

	var code = "";
	code += fs.readFileSync(targetDir + "/moxie.min.js") + "\n";
	code += fs.readFileSync(targetDir + "/plupload.min.js");

	fs.writeFileSync(targetDir + "/plupload.full.min.js", code);
});



desc("Language tools");
task("i18n", [], function(params) {
	var i18n = require('./build/i18n');

	switch (params) {
		case 'extract':
			var from = process.env.from || ['./src/plupload.js', './src/jquery.ui.plupload/jquery.ui.plupload.js', './src/jquery.plupload.queue/jquery.plupload.queue.js'];
			var to = process.env.to || './tmp/en.po';
			i18n.extract(from, to);
			break;

		case 'toPO':
			var from = process.env.from;
			var to = process.env.to || './tmp/i18n';
			i18n.toPot(from, to);
			break;

		case 'pull':
		default:
			var auth = process.env.auth.split(':');
			var to = process.env.to || './tmp/i18n';
			i18n.pull(utils.format("https://%s:%s@www.transifex.com/api/2/project/plupload/resource/core/", auth[0], auth[1]), to, complete);
	}

}, true);



desc("Generate documentation using YUIDoc");
task("docs", [], function (params) {
	yuidoc(["src", "src/jquery.plupload.queue", "src/jquery.ui.plupload"], "docs", {
		norecurse: true
	});
}, true);



desc("Generate wiki pages");
task("wiki", ["docs"], function() {
	wiki("git@github.com:moxiecode/plupload.wiki.git", "wiki", "docs");
});



desc("Runs JSHint on source files");
task("jshint", [], function (params) {
	jshint("src", {
		curly: true
	});
});



desc("Package library");
task("package", [], function (params) {
	var releaseInfo = tools.getReleaseInfo("./changelog.txt");

	var tmpDir = "./tmp";
	if (path.existsSync(tmpDir)) {
		jake.rmRf(tmpDir);
	}
	fs.mkdirSync(tmpDir, 0755);


	// User package
	utils.inSeries([
		function(cb) {
			zip([
				"js",
				"examples",
				["readme.md", "readme.txt"],
				"changelog.txt",
				"license.txt"
			], path.join(tmpDir, "plupload_" + releaseInfo.fileVersion + ".zip"), cb);
		},
		function(cb) {
			zip([
				"src",
				"js",
				"examples",
				//"tests",
				"build",
				"Jakefile.js",		
				["readme.md", "readme.txt"],
				"changelog.txt",
				"license.txt"
			], path.join(tmpDir, "plupload_" + releaseInfo.fileVersion + "_dev.zip"), cb);
		}
	], function() {
		complete();
	});
}, true);
