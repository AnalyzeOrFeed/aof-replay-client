'use strict';
/* jshint node:true */

var electron = require('gulp-electron');
var gulp = require('gulp');
var util = require('gulp-util');

var packageJson = require('./src/package.json');
var buildPackageJson = require('./package.json');

process.NODE_ENV = 'test';

gulp.task('package', function() {

    gulp.src("")
        .pipe(electron({
            src: './src',
            packageJson: packageJson,
            release: './release',
            cache: './cache',
            version: 'v' + buildPackageJson.devDependencies["electron-prebuilt"].slice(1) ,
            rebuild: false,
            packaging: true,
            asar: true,
            platforms: ['win32-ia32', 'win32-x64', 'darwin-x64'],
            platformResources: {
                darwin: {
                    CFBundleDisplayName: "AnalyzeOrFeed",
                    CFBundleIdentifier: "AnalyzeOrFeed",
                    CFBundleName: "AnalyzeOrFeed",
                    CFBundleVersion: packageJson.version,
                    icon: 'src/app/icons/aof.icns'
                },
                win: {
                    "version-string": packageJson.version,
                    "file-version": packageJson.version,
                    "product-version": packageJson.version,
                    "icon": 'src/app/icons/aof.ico'
                }
            }
        }))
        .pipe(gulp.dest(""));
});

gulp.task('default', ['package']);