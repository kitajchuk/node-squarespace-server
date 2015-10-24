/*!
 *
 * Squarespace cache.
 *
 */
var util = require( "./squarespace-util" ),

    // Default to unique logger incase setLogger isn't called
    logger = require( "node-squarespace-logger" ),
    path = require( "path" ),
    root = path.join( process.cwd(), ".sqs-cache" ),
    noop = function () {},
    cache = {},
    rJson = /json$/;


// Setup
util.isFile( root, function ( exists ) {
    if ( !exists ) {
        util.makeDir( root, function () {} );
    }
});


// Export
module.exports = {
    set: function ( key, val, minify ) {
        // Support an optional parameter to optionally minify
        // Default if `undefined` is `true` to perform minify
        minify = minify === undefined ? true : minify;

        logger.log( "cache", ("Store local cache for key => " + key) );

        var write = rJson.test( key ) ? util.writeJson : util.writeFile,
            value = rJson.test( key ) || !minify ? val : util.packStr( val );

        cache[ key ] = value;

        write( path.join( root, key ), value, noop );
    },

    get: function ( key ) {
        logger.log( "cache", ("Get local cache for key => " + key) );

        return (key ? cache[ key ] : cache);
    },

    remove: function ( key ) {
        logger.log( "cache", ("Remove local cache for key => " + key) );

        delete cache[ key ];

        util.removeFile( path.join( root, key ), noop );
    },

    clear: function () {
        logger.log( "cache", "Clear local cache" );

        cache = {};

        util.removeDir( root );
    },

    preload: function ( cb ) {
        util.readDir( root, function ( files ) {
            if ( files.length ) {
                var total = files.length;

                function getFile() {
                    if ( !files.length ) {
                        logger.log( "cache", "Preloaded local cache" );

                        cb();

                    } else {
                        var file = files.pop(),
                            read = rJson.test( file ) ? util.readJson : util.readFile;

                        read( path.join( root, file ), function ( data ) {
                            cache[ file ] = rJson.test( file ) ? data : util.packStr( data );

                            getFile();
                        });
                    }
                }

                getFile();

            } else {
                cb();
            }
        });
    },

    setLogger: function ( lgr ) {
        logger = lgr;
    }
};