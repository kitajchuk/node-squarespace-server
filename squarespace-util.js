var fse = require( "fs-extra" ),
    fs = require( "fs" ),


isFunc = function ( fn ) {
    return (typeof fn === "function");
},


log = function () {
    var args = [].slice.call( arguments, 0 );

    args.unshift( "> sqs-server:" );

    console.log.apply( console, args );
},


packStr = function ( str ) {
    str = str.split( /\n|\r|\t|\v/ );

    for ( var i = str.length; i--; ) {
        str[ i ] = str[ i ].replace( /^\s+|\s+$/, "" );
    }

    return str.join( "" );
},


isFile = function ( file, cb ) {
    if ( cb ) {
        fs.exists( file, function ( exists ) {
            cb( exists );
        });

    } else {
        return fs.existsSync( file );
    }
},


readDir = function ( dir, cb ) {
    if ( cb ) {
        fs.readdir( dir, function ( err, files ) {
            if ( !err ) {
                var reals = [];

                for ( var i = files.length; i--; ) {
                    if ( !/^\./.test( files[ i ] ) ) {
                        reals.push( files[ i ] );
                    }
                }

                cb( reals );

            } else {
                cb( [] );
            }
        });

    } else {
        return fs.readdirSync( dir );
    }
},


makeDir = function ( dir, cb ) {
    if ( cb ) {
        fs.mkdir( dir, function ( err ) {
            if ( !err ) {
                cb();
            }
        });

    } else {
        return fs.mkdirSync( dir );
    }
},


readFile = function ( file, cb ) {
    if ( cb ) {
        fs.readFile( file, "utf8", function ( err, data ) {
            if ( !err ) {
                cb( data );
            }
        });

    } else {
        return ("" + fs.readFileSync( file ));
    }
},


readJson = function ( file, cb ) {
    if ( cb ) {
        readFile( file, function ( data ) {
            cb( JSON.parse( "" + data ) );
        });

    } else {
        return JSON.parse( ("" + readFile( file )) );
    }
},


writeFile = function ( file, cont, cb ) {
    if ( cb ) {
        fs.writeFile( file, cont, "utf8", function ( err ) {
            if ( !err ) {
                cb();
            }
        });

    } else {
        fs.writeFileSync( file, cont );
    }
},


writeJson = function ( file, json, cb ) {
    writeFile( file, JSON.stringify( json, null, 4 ), cb );
},


removeFile = function ( file, cb ) {
    if ( cb ) {
        isFile( file, function ( exists ) {
            if ( exists ) {
                fs.unlink( file, function ( err ) {
                    if ( !err ) {
                        cb();
                    }
                });
            }
        });

    } else {
        if ( isFile( file ) ) {
            fs.unlinkSync( file );
        }
    }
},


removeDir = function ( dir, cb ) {
    if ( cb ) {
        fse.remove( dir, function ( err ) {
            if ( !err ) {
                cb();
            }
        });

    } else {
        fse.removeSync( dir );
    }
},


getAttrObj = function ( elem ) {
    var attrs = elem.match( /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g ),
        obj = {};

    for ( var i = attrs.length; i--; ) {
        var attr = attrs[ i ].split( "=" ),
            val = attr[ 1 ].replace( /\'|\"/g, "" );

        // Normalize values

        // Empty ?
        // Skip empties, they are `undefined`
        if ( val === "" ) {
            continue;
        }

        // False ?
        if ( val === "false" ) {
            val = false;
        }

        // True ?
        if ( val === "true" ) {
            val = true;
        }

        // Numeric ?
        if ( phpjs.is_numeric( val ) ) {
            val = parseInt( val, 10 );
        }

        obj[ attr[ 0 ] ] = val;
    }

    return obj;
},


getToken = function () {
    return ("token-" + Date.now() + ("" + Math.floor( (Math.random() * 1000000) + 1 )));
},


copy = function ( obj ) {
    var o = {};

    for ( var i in obj ) {
        if ( obj.hasOwnProperty( i ) ) {
            o[ i ] = obj[ i ];
        }
    }

    return o;
};


// Export
module.exports = {
    log: log,
    isFile: isFile,
    readDir: readDir,
    makeDir: makeDir,
    readJson: readJson,
    readFile: readFile,
    writeJson: writeJson,
    writeFile: writeFile,
    removeFile: removeFile,
    removeDir: removeDir,
    getToken: getToken,
    getAttrObj: getAttrObj,
    packStr: packStr,
    copy: copy
};