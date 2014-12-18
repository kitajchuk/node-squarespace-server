/*!
 *
 * Squarespace node server.
 *
 * - Cache conventions
 *      - block-*.html
 *      - query-*.json
 *      - page-*.json
 *      - page-*.html
 *      - api-*.json
 *
 */
var _ = require( "underscore" ),
    bodyParser = require( "body-parser" ),
    express = require( "express" ),
    path = require( "path" ),
    fs = require( "fs" ),
    fse = require( "fs-extra" ),
    slug = require( "slug" ),
    sqsMiddleware = require( "node-squarespace-middleware" ),
    functions = require( "./lib/functions" ),
    sqsTemplate = require( "./squarespace-template" ),
    rProtocol = /^https:|^http:/g,
    rSlash = /^\/|\/$/g,
    rIco = /\.ico$/,
    rApi = /^\/api/,
    rUniversal = /^\/universal/,
    sqsUser = null,
    sqsTimeOfLogin = null,
    sqsTimeLoggedIn = 86400000,
    directories = {},
    config = null,
    expressApp = express(),
    packageJson = functions.readJson( path.join( __dirname, "package.json" ) ),


/**
 *
 * config.server = {
 *      siteurl,
 *      port,
 *      webroot,
 *      protocol,
 *      siteData,
 *      cacheroot,
 *      password
 * };
 *
 * @method setServerConfig
 * @private
 *
 */
setServerConfig = function () {
    // @global - config
    config.server.siteurl = config.server.siteurl.replace( rSlash, "" );
    config.server.port = (config.server.port || 5050);
    config.server.webroot = process.cwd();
    config.server.protocol = config.server.siteurl.match( rProtocol )[ 0 ];
    config.server.siteData = {};

    if ( !config.server.cacheroot ) {
        config.server.cacheroot = path.join( config.server.webroot, ".sqs-cache" );

        if ( !fs.existsSync( config.server.cacheroot ) ) {
            fs.mkdirSync( config.server.cacheroot );
        }
    }

    // Set config for middleware
    sqsMiddleware.set( "siteurl", config.server.siteurl );

    if ( config.server.password ) {
        sqsMiddleware.set( "sitepassword", config.server.password );
    }

    if ( config.server.sandbox ) {
        sqsMiddleware.set( "sandboxmode", true );
    }

    // Set config on external modules
    sqsTemplate.setConfig( config );
},


/**
 *
 * @method setDirectories
 * @returns {object}
 * @private
 *
 */
setDirectories = function () {
    // @global - directories
    directories = {
        blocks: path.join( config.server.webroot, "blocks" ),
        collections: path.join( config.server.webroot, "collections" ),
        assets: path.join( config.server.webroot, "assets" ),
        pages: path.join( config.server.webroot, "pages" ),
        scripts: path.join( config.server.webroot, "scripts" ),
        styles: path.join( config.server.webroot, "styles" )
    };

    // Set directories on external modules
    sqsTemplate.setDirs( directories );
},


/**
 *
 * @method renderResponse
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
renderResponse = function ( appRequest, appResponse ) {
    var cacheHtml = null,
        cacheJson = null,
        cacheName = null,
        slugged = slug( appRequest.params[ 0 ] ),
        reqSlug = ( slugged === "" ) ? "homepage" : slugged,
        url = appRequest.params[ 0 ],
        qrs = {};

    cacheName = ("page-" + reqSlug);

    // Password?
    //if ( config.server.password ) {
    //    qrs.password = config.server.password;
    //}

    // Querystring?
    for ( var i in appRequest.query ) {
        qrs[ i ] = appRequest.query[ i ];

        // Unique cache file name including queries
        if ( i !== "format" && i !== "password" && i !== "nocache" ) {
            cacheName += ("-" + i + "--" + qrs[ i ]);
        }
    }

    cacheHtml = path.join( config.server.cacheroot, (cacheName + ".html") );
    cacheJson = path.join( config.server.cacheroot, (cacheName + ".json") );

    // JSON cache?
    if ( fs.existsSync( cacheJson ) ) {
        cacheJson = functions.readJson( path.join( config.server.cacheroot, (cacheName + ".json") ) );

    } else {
        cacheJson = null;
    }

    // HTML cache?
    if ( fs.existsSync( cacheHtml ) ) {
        cacheHtml = functions.readFileSquashed( path.join( config.server.cacheroot, (cacheName + ".html") ) );

    } else {
        cacheHtml = null;
    }

    // Nocache?
    if (  appRequest.query.nocache !== undefined ) {
        cacheJson = null;
        cacheHtml = null;

        functions.log( "Clearing request cache" );
    }

    // Cache?
    if ( cacheJson && cacheHtml && appRequest.query.format !== "json" ) {
        functions.log( "Loading request from cache" );

        sqsTemplate.renderTemplate( qrs, cacheJson, cacheHtml, function ( tpl ) {
            appResponse.status( 200 ).send( tpl );
        });

        return;
    }

    // JSON?
    if ( appRequest.query.format === "json" ) {
        if ( cacheJson ) {
            functions.log( "Loading json from cache" );

            appResponse.status( 200 ).json( cacheJson );

        } else {
            sqsMiddleware.getJson( url, qrs, function ( error, json ) {
                if ( !error ) {
                    functions.writeJson( path.join( config.server.cacheroot, (cacheName + ".json") ), json );

                    appResponse.status( 200 ).json( json );

                } else {
                    // Handle errors
                    functions.log( "ERROR - " + error );
                }
            });
        }

    // Request page?
    } else {
        sqsMiddleware.getJsonAndHtml( url, qrs, function ( error, data ) {
            if ( !error ) {
                if ( data.html.status === 404 || data.json.status === 404 ) {
                    appResponse.status( 200 ).send( functions.readFileSquashed( path.join( __dirname, "tpl/404.html" ) ) );

                    functions.log( "404 - Handled" );

                    return;
                }

                functions.writeJson( path.join( config.server.cacheroot, (cacheName + ".json") ), data.json.json );
                functions.writeFile( path.join( config.server.cacheroot, (cacheName + ".html") ), functions.squashContent( data.html.html ) );

                sqsTemplate.renderTemplate( qrs, data.json.json, functions.squashContent( data.html.html ), function ( tpl ) {
                    appResponse.status( 200 ).send( tpl );
                });

            } else {
                // Handle errors
                functions.log( "ERROR - " + error );
            }
        });
    }
},


/**
 *
 * @method onExpressRouterGET
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
onExpressRouterGET = function ( appRequest, appResponse ) {
    // Exit clause...
    if ( rApi.test( appRequest.params[ 0 ] ) ) {
        appResponse.end();

        return;
    }

    // Favicon / Universal Image
    if ( rIco.test( appRequest.params[ 0 ] ) || rUniversal.test( appRequest.params[ 0 ] ) ) {
        appResponse.redirect( (config.server.siteurl + appRequest.params[ 0 ]) );

        return;
    }

    // Config
    if ( appRequest.params[ 0 ].replace( rSlash, "" ) === "config" ) {
        functions.log( "CONFIG - Author your content!" );

        appResponse.redirect( (config.server.siteurl + "/config/") );

        return;
    }

    // Logout
    if ( appRequest.params[ 0 ].replace( rSlash, "" ) === "logout" ) {
        functions.log( "AUTH - Logout of Squarespace!" );

        sqsUser = null;

        appResponse.redirect( "/" );

        return;
    }

    // Authentication
    if ( !sqsUser ) {
        functions.log( "AUTH - Login to Squarespace!" );

        appResponse.status( 200 ).send( functions.readFileSquashed( path.join( __dirname, "tpl/login.html" ) ) );

        return;
    }

    // Login expired
    if ( (Date.now() - sqsTimeOfLogin) >= sqsTimeLoggedIn ) {
        functions.log( "AUTH EXPIRED - Logout of Squarespace!" );

        appResponse.redirect( "/logout" );

        return;
    }

    // Log URI
    functions.log( "GET - " + appRequest.params[ 0 ] );

    // Run the template compiler
    sqsTemplate.setSQSHeadersFooters();
    sqsTemplate.setHeaderFooter();
    sqsTemplate.compileCollections();
    sqsTemplate.compileRegions();
    sqsTemplate.replaceBlocks();
    sqsTemplate.replaceScripts();
    sqsTemplate.replaceSQSScripts();
    sqsTemplate.compileStylesheets();

    // Render the response
    renderResponse( appRequest, appResponse );
},


/**
 *
 * @method onExpressRouterPOST
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
onExpressRouterPOST = function ( appRequest, appResponse ) {
    var data = {
            email: appRequest.body.email,
            password: appRequest.body.password
        };

    if ( !data.email || !data.password ) {
        functions.log( "AUTH - Email AND Password required." );

        appResponse.send( functions.readFileSquashed( path.join( __dirname, "tpl/login.html" ) ) );

        return;
    }

    // Keep user data in memory
    sqsUser = data;

    // Set middleware config
    sqsMiddleware.set( "useremail", data.email );
    sqsMiddleware.set( "userpassword", data.password );

    // Set user on external modules
    sqsTemplate.setUser( sqsUser );

    // Login to site
    sqsMiddleware.doLogin(function ( error ) {
        if ( !error ) {
            // Fetch site API data
            sqsMiddleware.getAPIData( function ( error, data ) {
                if ( !error ) {
                    // Store the site data needed
                    config.server.siteData = data;

                    // Set config on external modules
                    sqsTemplate.setConfig( config );

                    // Store time of login
                    sqsTimeOfLogin = Date.now();

                    // End login post
                    appResponse.json({
                        success: true
                    });

                } else {
                    // Handle errors
                    functions.log( "ERROR - " + error );
                }
            });

        } else {
            // Handle errors
            functions.log( "ERROR - " + error );

            // Reload login
            appResponse.redirect( "/" );
        }
    });
},


/**
 *
 * @method printUsage
 * @private
 *
 */
printUsage = function () {
    console.log( "Squarespace Server" );
    console.log( "Version " + packageJson.version );
    console.log();
    console.log( "Commands:" );
    console.log( "sqs buster       Delete local site cache" );
    console.log( "sqs server       Start the local server" );
    console.log();
    console.log( "Options:" );
    console.log( "sqs --version    Print package version" );
    console.log( "sqs --forever    Start server using forever" );
    console.log( "sqs --fornever   Stop server started with forever" );
    console.log( "sqs --port=XXXX  Use the specified port" );
    console.log();
    console.log( "Examples:" );
    console.log( "sqs server --port=8000" );
    process.exit();
},


/**
 *
 * @method processArguments
 * @param {object} args The arguments array
 * @private
 *
 */
processArguments = function ( args ) {
    var flags = {},
        commands = {};

    if ( !args || !args.length ) {
        printUsage();
    }

    _.each( args, function ( arg ) {
        var rFlag = /^--/,
            split;

        if ( rFlag.test( arg ) ) {
            split = arg.split( "=" );
            flags[ split[ 0 ].replace( rFlag, "" ) ] = (split[ 1 ] || undefined);

        } else {
            commands[ arg ] = true;
        }
    });

    // Order of operations
    if ( flags.version ) {
        functions.log( packageJson.version );
        process.exit();

    } else if ( commands.buster ) {
        fse.removeSync( path.join( config.server.cacheroot ) );
        functions.log( "Trashed your local .sqs-cache." );
        process.exit();

    } else if ( commands.server ) {
        if ( flags.port ) {
            config.server.port = flags.port;
        }

        startServer();
    }
},


/**
 *
 * @method startServer
 * @private
 *
 */
startServer = function () {
    // Create express application
    expressApp.use( express.static( config.server.webroot ) );
    expressApp.use( bodyParser.json() );
    expressApp.use( bodyParser.urlencoded( {extended: true} ) );
    expressApp.set( "port", config.server.port );
    expressApp.get( "*", onExpressRouterGET );
    expressApp.post( "/", onExpressRouterPOST );
    expressApp.listen( expressApp.get( "port" ) );

    // Log that the server is running
    functions.log( ("Running site on localhost:" + expressApp.get( "port" )) );
};


/******************************************************************************
 * @Export
*******************************************************************************/
module.exports = {
    /**
     *
     * @method init
     * @param {object} conf The template.conf json
     * @param {object} args The command arguments
     * @public
     *
     */
    init: function ( conf, args ) {
        // Create global config
        config = conf;

        // Create global config.server
        setServerConfig();

        // Create global directories
        setDirectories();

        // Handle arguments
        processArguments( args );
    },

    /**
     *
     * @method print
     * @public
     *
     */
    print: printUsage
};