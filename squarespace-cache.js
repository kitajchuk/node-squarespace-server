/*!
 *
 * Squarespace cache.
 *
 */
var util = require( "./squarespace-util" ),
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
    set: function ( key, val ) {
        util.log( "Cache.set", key );

        var write = rJson.test( key ) ? util.writeJson : util.writeFile,
            value = rJson.test( key ) ? val : util.packStr( val );

        cache[ key ] = value;

        write( path.join( root, key ), value, noop );
    },

    get: function ( key ) {
        util.log( "Cache.get", key );

        return (key ? cache[ key ] : cache);
    },

    remove: function ( key ) {
        util.log( "Cache.remove", key );

        delete cache[ key ];

        util.removeFile( path.join( root, key ), noop );
    },

    clear: function () {
        util.log( "Cache.clear" );

        cache = {};

        util.removeDir( root );
    },

    preload: function ( cb ) {
        util.readDir( root, function ( files ) {
            if ( files.length ) {
                var total = files.length;

                function getFile() {
                    if ( !files.length ) {
                        util.log( "Cache.preload" );

                        cb();

                    } else {
                        var file = files.pop(),
                            read = rJson.test( file ) ? util.readJson : util.readFile;

                        read( path.join( root, file ), function ( data ) {
                            cache[ file ] = rJson.test( file ) ? data : util.packStr( data );

                            //process.stdout.clearLine();
                            //process.stdout.cursorTo( 0 );
                            //process.stdout.write( ((total - files.length) / total) * 100 + "%" );

                            getFile();
                        });
                    }
                }

                getFile();

            } else {
                cb();
            }
        });
    }
};