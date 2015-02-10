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
    templateConfig = null,
    serverConfig = null,
    templateConfigPath = path.join( process.cwd(), "template.conf" ),
    expressApp = express(),
    packageJson = functions.readJson( path.join( __dirname, "package.json" ) ),


/**
 *
 * serverConfig = {
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
 * @param {object} conf The parsed template.conf
 * @private
 *
 */
setServerConfig = function ( conf ) {
    serverConfig = conf.server;

    serverConfig.siteurl = serverConfig.siteurl.replace( rSlash, "" );
    serverConfig.port = (serverConfig.port || 5050);
    serverConfig.webroot = process.cwd();
    serverConfig.protocol = serverConfig.siteurl.match( rProtocol )[ 0 ];
    serverConfig.siteData = {};

    if ( !serverConfig.cacheroot ) {
        serverConfig.cacheroot = path.join( serverConfig.webroot, ".sqs-cache" );

        if ( !fs.existsSync( serverConfig.cacheroot ) ) {
            fs.mkdirSync( serverConfig.cacheroot );
        }
    }

    // Set config for middleware
    sqsMiddleware.set( "siteurl", serverConfig.siteurl );

    if ( serverConfig.password ) {
        sqsMiddleware.set( "sitepassword", serverConfig.password );
    }

    if ( serverConfig.sandbox ) {
        sqsMiddleware.set( "sandboxmode", true );
    }

    sqsTemplate.setConfig( "server", serverConfig );
},


/**
 *
 * @method setTemplateConfig
 * @param {object} conf The parsed template.conf
 * @private
 *
 */
setTemplateConfig = function ( conf ) {
    templateConfig = conf;

    delete setTemplateConfig.server;

    sqsTemplate.setConfig( "template", templateConfig );
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
        blocks: path.join( serverConfig.webroot, "blocks" ),
        collections: path.join( serverConfig.webroot, "collections" ),
        assets: path.join( serverConfig.webroot, "assets" ),
        pages: path.join( serverConfig.webroot, "pages" ),
        scripts: path.join( serverConfig.webroot, "scripts" ),
        styles: path.join( serverConfig.webroot, "styles" )
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

    // Querystring?
    for ( var i in appRequest.query ) {
        qrs[ i ] = appRequest.query[ i ];

        // Unique cache file name including queries
        if ( i !== "format" && i !== "password" && i !== "nocache" ) {
            cacheName += ("-" + i + "--" + qrs[ i ]);
        }
    }

    cacheHtml = path.join( serverConfig.cacheroot, (cacheName + ".html") );
    cacheJson = path.join( serverConfig.cacheroot, (cacheName + ".json") );

    // JSON cache?
    if ( fs.existsSync( cacheJson ) ) {
        cacheJson = functions.readJson( path.join( serverConfig.cacheroot, (cacheName + ".json") ) );

    } else {
        cacheJson = null;
    }

    // HTML cache?
    if ( fs.existsSync( cacheHtml ) ) {
        cacheHtml = functions.readFileSquashed( path.join( serverConfig.cacheroot, (cacheName + ".html") ) );

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
                    functions.writeJson( path.join( serverConfig.cacheroot, (cacheName + ".json") ), json.json );

                    appResponse.status( 200 ).json( json.json );

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

                functions.writeJson( path.join( serverConfig.cacheroot, (cacheName + ".json") ), data.json.json );
                functions.writeFile( path.join( serverConfig.cacheroot, (cacheName + ".html") ), functions.squashContent( data.html.html ) );

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
 * @method getFolderRoot
 * @param {string} uri The express request uri
 * @returns {object}
 * @private
 *
 */
getFolderRoot = function ( uri ) {
    var ret = {
        folder: false,
        redirect: false
    };

    uri = uri.replace( rSlash, "" );

    for ( var i = serverConfig.siteData.siteLayout.layout.length; i--; ) {
        var layout = serverConfig.siteData.siteLayout.layout[ i ];

        // Break out if folder matched
        if ( ret.folder ) {
            break;
        }

        // Skip hidden navigations
        if ( layout.identifier === "_hidden" ) {
            continue;
        }

        for ( var j = layout.links.length; j--; ) {
            var link = layout.links[ j ];

            // Matched a root level folder uri request
            if ( link.typeName === "folders" && link.urlId === uri ) {
                ret.folder = true;
                ret.redirect = ("/" + link.children[ 0 ].urlId + "/");
                break;
            }
        }
    }

    return ret;
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
    var checkFolder,
        apiQuery;

    // Site CSS
    if ( appRequest.params[ 0 ].replace( rSlash, "" ) === "site.css" ) {
        functions.log( "SITE CSS - " + appRequest.params[ 0 ] );

        // Always serve fresh styles
        sqsTemplate.compileStylesheets();

        appResponse.set( "Content-Type", "text/css" ).status( 200 ).send( sqsTemplate.getSiteCss() );

        return;
    }

    // Exit clause...
    if ( rApi.test( appRequest.params[ 0 ] ) ) {
        functions.log( "API - " + appRequest.params[ 0 ] );

        apiQuery = appRequest.query;
        apiQuery.crumb = sqsMiddleware.getCrumb();

        sqsMiddleware.getJson( appRequest.params[ 0 ], apiQuery, function ( error, data ) {
            if ( !error ) {
                appResponse.set( "Content-Type", "application/json" ).status( data.status ).send( data.json );
            }
        });

        return;
    }

    // Favicon / Universal Image
    if ( rIco.test( appRequest.params[ 0 ] ) || rUniversal.test( appRequest.params[ 0 ] ) ) {
        appResponse.redirect( (serverConfig.siteurl + appRequest.params[ 0 ]) );

        return;
    }

    // Config
    if ( appRequest.params[ 0 ].replace( rSlash, "" ) === "config" ) {
        functions.log( "CONFIG - Author your content!" );

        appResponse.redirect( (serverConfig.siteurl + "/config/") );

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

    // Top level folder
    checkFolder = getFolderRoot( appRequest.params[ 0 ] );

    if ( checkFolder.folder ) {
        functions.log( "FOLDER ROOT - " + appRequest.params[ 0 ] );

        appResponse.redirect( checkFolder.redirect );

        return;
    }

    // Log URI
    functions.log( "GET - " + appRequest.params[ 0 ] );

    // Update the template config for all requests, reloads stylesheets etc...
    setTemplateConfig( functions.readJson( templateConfigPath ) );

    // Run the template compiler
    sqsTemplate.setSQSHeadersFooters();
    sqsTemplate.setHeaderFooter();
    sqsTemplate.compileCollections();
    sqsTemplate.compileRegions();
    sqsTemplate.replaceBlocks();
    sqsTemplate.replaceScripts();
    sqsTemplate.replaceSQSScripts();

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
    sqsMiddleware.doLogin(function ( error, headers ) {
        if ( !error ) {
            // Fetch site API data
            sqsMiddleware.getAPIData( function ( error, data ) {
                if ( !error ) {
                    // Store the site data needed
                    serverConfig.siteData = data;

                    // Set config on external modules
                    sqsTemplate.setConfig( "server", serverConfig );

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
 * @method printUsage
 * @private
 *
 */
printVersion = function () {
    functions.log( packageJson.version );
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
            flags[ split[ 0 ].replace( rFlag, "" ) ] = (split[ 1 ] || true);

        } else {
            commands[ arg ] = true;
        }
    });

    // Order of operations
    if ( flags.version ) {
        functions.log( packageJson.version );
        process.exit();

    } else if ( commands.buster ) {
        fse.removeSync( path.join( serverConfig.cacheroot ) );
        functions.log( "Trashed your local .sqs-cache." );
        process.exit();

    } else if ( commands.server ) {
        if ( flags.port ) {
            serverConfig.port = flags.port;
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
    expressApp.use( express.static( serverConfig.webroot ) );
    expressApp.use( bodyParser.json() );
    expressApp.use( bodyParser.urlencoded( {extended: true} ) );
    expressApp.set( "port", serverConfig.port );
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
        // Create global serverConfig
        setServerConfig( conf );

        // Create global templateConfig
        setTemplateConfig( conf );

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
    print: printUsage,

    /**
     *
     * @method printv
     * @public
     *
     */
    printv: printVersion
};