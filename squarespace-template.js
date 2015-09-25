/*!
 *
 * Squarespace template.
 *
 */
var path = require( "path" ),
    fs = require( "fs" ),
    uglifycss = require( "uglifycss" ),
    mustache = require( "mustache" ),
    exec = require( "child_process" ).exec,
    rimraf = require( "rimraf" ),

    rIndexFolder = /index|folder/g,
    rMetaLeft = /\{\.meta-left\}/g,
    rMetaRight = /\{\.meta-right\}/g,
    rSlash = /^\/|\/$/g,
    rJsonT = /^\{.*?\}$/,
    rScripts = /<script.*?\>(.*?)<\/script\>/g,
    rBlockIncs = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rTplFiles = /\.item$|\.list$|\.region$/,
    rItemOrList = /\.item$|\.list$/,
    rRegions = /\.region$/,
    rItem = /\.item$/,
    rList = /\.list$/,
    rLess = /\.less$/,
    rCss = /\.css$/,
    rJs = /\.js/,
    rBlock = /\.block$/,
    rPage = /\.page$/,
    rJson = /\{@\|json.*?\}/,
    rBodyTag = /<body.*?\>/,
    rSQSQuery = /(<squarespace:query.*?\>)(.*?)(<\/squarespace:query\>)/,
    rSQSQueryG = /(<squarespace:query.*?\>)(.*?)(<\/squarespace:query\>)/g,
    rSQSNavis = /<squarespace:navigation(.*?)\/\>/g,
    rSQSFolderNavis = /<squarespace:folder-navigation(.*?)\/\>/g,
    rSQSBlockFields = /<squarespace:block-field(.*?)\/\>/g,
    rSQSScripts = /<squarespace:script(.*?)\/\>/g,
    rSQSFootersFull = /<script type="text\/javascript" data-sqs-type="imageloader-bootstraper"\>(.*?)(Squarespace\.afterBodyLoad\(Y\);)<\/script\>/,
    rSQSHeadersFull = /<\!-- This is Squarespace\. -->(.*?)<\!-- End of Squarespace Headers -->/,
    SQS_HEADERS = "{squarespace-headers}",
    SQS_FOOTERS = "{squarespace-footers}",
    SQS_MAIN_CONTENT = "{squarespace.main-content}",
    SQS_PAGE_CLASSES = "{squarespace.page-classes}",
    SQS_PAGE_ID = /\{squarespace\.page-id\}|squarespace\.page-id/g,
    SQS_POST_ENTRY = "{squarespace-post-entry}",
    sqsHeaders = [],
    sqsFooters = [],
    sqsUser = null,
    directories = {},
    config = {},
    scripts = [],
    siteCss = "",
    templates = {
        regions: {},
        collections: {},
        blocks: {},
        pages: {}
    },
    layoutHTML = "",
    updating = {},

    // Default to unique logger incase setLogger isn't called
    sqsLogger = require( "node-squarespace-logger" ),
    sqsMiddleware = require( "node-squarespace-middleware" ),
    sqsUtil = require( "./squarespace-util" ),
    sqsBlocktypes = require( "./squarespace-blocktypes" ),
    sqsCollectiontypes = require( "./squarespace-collectiontypes" ),
    sqsJsonTemplate = require( "node-squarespace-jsont" ),
    sqsCache = require( "./squarespace-cache" ),


/******************************************************************************
 * @Public
*******************************************************************************/

/**
 *
 * @method preload
 * @public
 *
 */
preload = function () {
    sqsUtil.readFile( path.join( __dirname, "tpl/layout.html" ), function ( data ) {
        layoutHTML = sqsUtil.packStr( data );
    });
},


/**
 *
 * @method compile
 * @param {function} cb The callback when loaded
 * @public
 *
 */
compile = function ( cb ) {
    var compiled = 0,
        methods = [
            compileBlocks,
            compileRegions,
            compileCollections,
            compileStylesheets
        ];

    // Maybe a template won't have static pages ?
    if ( fs.existsSync( directories.pages ) ) {
        methods.push( compilePages );
    }

    function done() {
        compiled++;

        if ( compiled === methods.length ) {
            replaceAll();

            cb();
        }
    }


    for ( var i = 0; i < methods.length; i++ ) {
        methods[ i ].call(
            null,
            done
        );
    }
},


/**
 *
 * @method watch
 * @public
 *
 */
watch = function ( cb ) {
    function doneWatch( filename ) {
        sqsLogger.log( "template", "Reloaded local template" );

        replaceAll();

        cb();

        setTimeout( function () {
            delete updating[ filename ];

        }, 500 );
    }

    function onWatch( event, filename ) {
        if ( !updating[ filename ] ) {
            if ( rItemOrList.test( filename ) || rPage.test( filename ) || rRegions.test( filename ) || rBlock.test( filename ) || rLess.test( filename ) || rCss.test( filename ) || rJs.test( filename ) ) {
                updating[ filename ] = true;

                sqsLogger.log( "template", ("Updated template file " + filename) );

                compile(function () {
                    doneWatch( filename );
                });
            }
        }
    }

    fs.watch( process.cwd(), onWatch );
    fs.watch( directories.blocks, onWatch );
    fs.watch( directories.collections, onWatch );
    fs.watch( directories.styles, onWatch );
    fs.watch( directories.scripts, onWatch );

    // Maybe a template won't have static pages ?
    if ( fs.existsSync( directories.pages ) ) {
        fs.watch( directories.pages, onWatch );
    }
},


/**
 *
 * @method replaceAll
 * @public
 *
 */
replaceAll = function () {
    replaceBlocks();
    replaceScripts();
    replaceSQSScripts();
},


/**
 *
 * @method watch
 * @public
 *
 */
refresh = function () {
    //scripts = [];
    sqsHeaders = [];
    sqsFooters = [];
},


/**
 *
 * @method setLogger
 * @param {object} logger The log module
 * @public
 *
 */
setLogger = function ( logger ) {
    sqsLogger = logger;
},


/**
 *
 * @method setConfig
 * @param {object} conf The server configuration
 * @public
 *
 */
setConfig = function ( key, conf ) {
    config[ key ] = conf;
},


/**
 *
 * @method setDirs
 * @param {object} conf The directories
 * @public
 *
 */
setDirs = function ( dirs ) {
    directories = dirs;
},


/**
 *
 * @method setUser
 * @param {object} conf The directories
 * @public
 *
 */
setUser = function ( user ) {
    sqsUser = user;
},


/**
 *
 * @method getSiteCss
 * @returns {string} compiled css
 * @public
 *
 */
getSiteCss = function () {
    return siteCss;
},


/**
 *
 * @method replaceBlocks
 * @public
 *
 */
replaceBlocks = function () {
    var matched,
        block;

    for ( var i in templates.regions ) {
        while ( matched = templates.regions[ i ].match( rBlockIncs ) ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                block = matched[ j ].replace( rBlockTags, "" );
                block = templates.blocks[ block ];

                templates.regions[ i ] = templates.regions[ i ].replace( matched[ j ], block );
            }
        }
    }

    for ( var i in templates.collections ) {
        while ( matched = templates.collections[ i ].match( rBlockIncs ) ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                block = matched[ j ].replace( rBlockTags, "" );
                block = templates.blocks[ block ];

                templates.collections[ i ] = templates.collections[ i ].replace( matched[ j ], block );
            }
        }
    }

    for ( i in templates.pages ) {
        while ( matched = templates.pages[ i ].match( rBlockIncs ) ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                block = matched[ j ].replace( rBlockTags, "" );
                block = templates.blocks[ block ];

                templates.pages[ i ] = templates.pages[ i ].replace( matched[ j ], block );
            }
        }
    }

    for ( i in templates.blocks ) {
        while ( matched = templates.blocks[ i ].match( rBlockIncs ) ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                block = matched[ j ].replace( rBlockTags, "" );
                block = templates.blocks[ block ];

                templates.blocks[ i ] = templates.blocks[ i ].replace( matched[ j ], block );
            }
        }
    }
},


/**
 *
 * @method replaceScripts
 * @public
 *
 */
replaceScripts = function () {
    var matched,
        token;

    for ( var i in templates.regions ) {
        matched = templates.regions[ i ].match( rScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                if ( !rJson.test( matched[ j ] ) ) {
                    token = sqsUtil.getToken();
                    scripts.push({
                        token: token,
                        script: matched[ j ]
                    });

                    templates.regions[ i ] = templates.regions[ i ].replace( matched[ j ], token );
                }
            }
        }
    }

    for ( var i in templates.collections ) {
        matched = templates.collections[ i ].match( rScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                if ( !rJson.test( matched[ j ] ) ) {
                    token = sqsUtil.getToken();
                    scripts.push({
                        token: token,
                        script: matched[ j ]
                    });

                    templates.collections[ i ] = templates.collections[ i ].replace( matched[ j ], token );
                }
            }
        }
    }

    for ( var i in templates.pages ) {
        matched = templates.pages[ i ].match( rScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                if ( !rJson.test( matched[ j ] ) ) {
                    token = sqsUtil.getToken();
                    scripts.push({
                        token: token,
                        script: matched[ j ]
                    });

                    templates.pages[ i ] = templates.pages[ i ].replace( matched[ j ], token );
                }
            }
        }
    }
},


/**
 *
 * @method replaceSQSScripts
 * @public
 *
 */
replaceSQSScripts = function () {
    var matched,
        attrs,
        block,
        filed;

    for ( var i in templates.regions ) {
        matched = templates.regions[ i ].match( rSQSScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                attrs = sqsUtil.getAttrObj( matched[ j ] );
                block = ( "/scripts/" + attrs.src );
                filed = '<script src="' + block + '"></script>';

                templates.regions[ i ] = templates.regions[ i ].replace( matched[ j ], filed );
            }
        }
    }

    for ( var i in templates.collections ) {
        matched = templates.collections[ i ].match( rSQSScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                attrs = sqsUtil.getAttrObj( matched[ j ] );
                block = ( "/scripts/" + attrs.src );
                filed = '<script src="' + block + '"></script>';

                templates.collections[ i ] = templates.collections[ i ].replace( matched[ j ], filed );
            }
        }
    }
},


/**
 *
 * @method renderTemplate
 * @param {object} qrs Querystring mapping
 * @param {object} pageJson JSON data for page
 * @param {string} pageHtml HTML for page
 * @param {function} clalback Fired when done
 * @public
 *
 */
renderTemplate = function ( qrs, pageJson, pageHtml, callback ) {
    var queries = {
            raw: [],
            processed: []
        },
        processedQueries = 0,
        matched = null,
        templateKey = getTemplateKey( pageJson ),
        rendered = "",
        regionKey,
        len,
        i;

    // Unique page JSON property for sandbox dev mode
    pageJson.nodeServer = true;

    // Create {squarespace-headers} / {squarespace-footers}
    setHeaderFooterTokens( pageJson, pageHtml );

    // 0.1 => Template is a list or item for a collection, NOT a region
    // Injection point for {squarespace.main-content} AND add the site layout
    if ( rItemOrList.test( templateKey ) ) {
        regionKey = ((pageJson.collection.regionName || "default") + ".region");

        // Possibly the regionName isn't really what we want ?
        // It would seem that when using galleries, the regionKey is not what we're looking for.
        // In this case, just assume the collection template and we don't have to replace mainContent.
        if ( !templates.regions[ regionKey ] ) {
            rendered += templates.collections[ templateKey ];

        } else {
            // This wraps the matched collection template with the default or set region
            rendered += templates.regions[ regionKey ].replace( SQS_MAIN_CONTENT, templates.collections[ templateKey ] );
        }

    // 0.2 => Template is a static page
    } else if ( rPage.test( templateKey ) ) {
        regionKey = ((pageJson.collection.regionName || "default") + ".region");

        // In case there was a regionName but no `layout` to match in `template.conf`
        regionKey = templates.regions[ regionKey ] ? regionKey : "default.region";

        // This wraps the matched page template with the default or set region
        rendered += templates.regions[ regionKey ].replace( SQS_MAIN_CONTENT, templates.pages[ templateKey ] );

    } else {
        rendered += templates.regions[ templateKey ];
    }

    // Pre-process Queries
    matched = rendered.match( rSQSQueryG );

    if ( matched ) {
        for ( i = 0, len = matched.length; i < len; i++ ) {
            var match = matched[ i ].match( rSQSQuery ),
                token = sqsUtil.getToken();

            rendered = rendered.replace( match[ 2 ], token );

            queries.raw.push({
                token: token,
                template: match[ 2 ]
            });
        }
    }

    // Render squarespace tags like {squarespace.page-id} etc...
    rendered = replaceSQSTags( rendered, pageJson, pageHtml );

    // Render {squarespace-headers} to the best of our ability
    rendered = rendered.replace( SQS_HEADERS, sqsHeaders.join( "" ) );

    // Render {squarespace-footers} to the best of our ability
    rendered = rendered.replace( SQS_FOOTERS, sqsFooters.join( "" ) );

    // Render Navigations from pageJson
    rendered = replaceNavigations( rendered, pageJson );

    // Render Folder Navigations from pageJson
    rendered = replaceFolderNavigations( rendered, pageJson );

    // Render page in full w/jsontemplate
    rendered = sqsJsonTemplate.render( rendered, pageJson );

    // Post-process Queries
    matched = rendered.match( rSQSQueryG );

    if ( matched ) {
        for ( i = 0, len = matched.length; i < len; i++ ) {
            var match = matched[ i ].match( rSQSQuery ),
                token = match[ 2 ];

            for ( var j = queries.raw.length; j--; ) {
                if ( queries.raw[ j ].token === token ) {
                    queries.processed.push({
                        template: queries.raw[ j ].template,
                        queryData: sqsUtil.getAttrObj( match[ 1 ] ),
                        queryProcessed: match[ 0 ]
                    });
                }
            }
        }
    }

    function handleDone() {
        // Add token scripts back into the template
        for ( i = scripts.length; i--; ) {
            // Allow {.meta-left} and {.meta-right}
            scripts[ i ].script = scripts[ i ].script.replace( rMetaLeft, "{" ).replace( rMetaRight, "}" );

            rendered = rendered.replace( scripts[ i ].token, scripts[ i ].script );
        }

        // Render Block Fields
        replaceBlockFields( rendered, qrs, function ( finalRender ) {
            callback( finalRender );
        });
    }

    function handleQueried() {
        if ( processedQueries === queries.processed.length ) {
            handleDone();
            return;
        }

        var query = queries.processed[ processedQueries ],
            cache = null,
            key = "",
            tpl = null;

        processedQueries++;
        key = ("query-" + query.queryData.collection);

        for ( i in qrs ) {
            // Skip password in unique cache
            if ( i !== "format" && i !== "password" && i !== "nocache" ) {
                key += ("-" + i + "--" + qrs[ i ]);
            }
        }

        // Tag?
        if ( query.queryData.tag ) {
            key += "-tag--" + query.queryData.tag;
        }

        // Category?
        if ( query.queryData.category ) {
            key += "-category--" + query.queryData.category;
        }

        key = (key + ".json");
        cache = sqsCache.get( key );

        // Cached?
        if ( cache && qrs.nocache === undefined ) {
            cache.nodeServer = true;

            tpl = sqsJsonTemplate.render( query.template, cache );

            rendered = rendered.replace( query.queryProcessed, tpl );

            handleQueried();

        } else {
            sqsMiddleware.getQuery( query.queryData, qrs, function ( error, json ) {
                if ( !error ) {
                    sqsCache.set( key, json );

                    json.nodeServer = true;

                    tpl = sqsJsonTemplate.render( query.template, json );

                    rendered = rendered.replace( query.queryProcessed, tpl );

                    handleQueried();

                } else {
                    // Handle errors
                    sqsLogger.log( "error", ("Squarespace:query request error => " + error) );
                }
            });
        }
    }

    if ( queries.processed.length ) {
        handleQueried();

    } else {
        handleDone();
    }
},


/******************************************************************************
 * @Private
*******************************************************************************/

/**
 *
 * @method compileRegions
 * @param {function} cb The callback when done
 * @private
 *
 */
compileRegions = function ( cb ) {
    var regions = [];

    for ( var i in config.template.layouts ) {
        regions.push({
            files: sqsUtil.copyArr( config.template.layouts[ i ].regions ),
            link: (i + ".region")
        });
    }

    function read() {
        if ( !regions.length ) {
            cb();

        } else {
            var region = regions.pop(),
                cont = "";

            function _read() {
                var file = path.join( config.server.webroot, (region.files.shift() + ".region") );

                sqsUtil.readFile( file, function ( data ) {
                    cont += sqsUtil.packStr( data );

                    if ( !region.files.length ) {
                        templates.regions[ region.link ] = cont;

                        read();

                    } else {
                        _read();
                    }
                });
            }

            _read();
        }
    }

    read();
},


/**
 *
 * @method compileBlocks
 * @param {function} cb The callback when done
 * @private
 *
 */
compileBlocks = function ( cb ) {
    sqsUtil.readDir( directories.blocks, function ( files ) {
        function read() {
            if ( !files.length ) {
                cb();

            } else {
                var block = files.pop(),
                    file = path.join( directories.blocks, block );

                if ( !rBlock.test( block ) ) {
                    read();
                    return;
                }

                sqsUtil.readFile( file, function ( data ) {
                    templates.blocks[ block ] = sqsUtil.packStr( data );

                    read();
                });
            }
        }

        read();
    });
},


/**
 *
 * @method compileCollections
 * @param {function} cb The callback when done
 * @private
 *
 */
compileCollections = function ( cb ) {
    sqsUtil.readDir( directories.collections, function ( files ) {
        function read() {
            if ( !files.length ) {
                cb();

            } else {
                var collection = files.pop(),
                    file = path.join( directories.collections, collection );

                if ( !rItemOrList.test( collection ) ) {
                    read();
                    return;
                }

                sqsUtil.readFile( file, function ( data ) {
                    templates.collections[ collection ] = sqsUtil.packStr( data );

                    read();
                });
            }
        }

        read();
    });
},


/**
 *
 * @method compilePages
 * @param {function} cb The callback when done
 * @private
 *
 */
compilePages = function ( cb ) {
    sqsUtil.readDir( directories.pages, function ( files ) {
        function read() {
            if ( !files.length ) {
                cb();

            } else {
                var page = files.pop(),
                    file = path.join( directories.pages, page );

                if ( !rPage.test( page ) ) {
                    read();
                    return;
                }

                sqsUtil.readFile( file, function ( data ) {
                    templates.pages[ page ] = sqsUtil.packStr( data );

                    read();
                });
            }
        }

        read();
    });
},


/**
 *
 * @method compileStylesheets
 * @param {function} cb The callback when done
 * @private
 *
 */
compileStylesheets = function ( cb ) {
    siteCss = "";

    var tmpDir = path.join( directories.styles, ".tmp" ),
        tmpFile = path.join( tmpDir, "site.less" ),
        outFile = path.join( tmpDir, "site.css" ),
        lessC = path.join( __dirname, "bin", "lessc" ),
        styles = [{
            name: "reset.css",
            path: path.join( directories.styles, "reset.css" )
        }];

    for ( var i = 0, len = config.template.stylesheets.length; i < len; i++ ) {
        styles.push({
            name: config.template.stylesheets[ i ],
            path: path.join( directories.styles, config.template.stylesheets[ i ] )
        });
    }

    // Make sure we clear out the `.tmp` dir
    rimraf.sync( tmpDir );

    // Remake the `.tmp` dir
    sqsUtil.makeDir( tmpDir );

    function read() {
        if ( !styles.length ) {
            sqsUtil.writeFile( tmpFile, siteCss );

            exec( (lessC + " --compress " + tmpFile + " " + outFile), function ( error, stdout, stderr ) {
                //siteCss = sqsUtil.readFile( outFile );
                //rimraf.sync( tmpDir );
                console.log( arguments );
                //console.log( siteCss );
                //cb();
            });

        } else {
            var style = styles.shift();

            sqsUtil.isFile( style.path, function ( exists ) {
                if ( !exists ) {
                    read();

                } else {
                    sqsUtil.readFile( style.path, function ( data ) {
                        siteCss += data;

                        read();
                    });
                }
            });
        }
    }

    read();
},


/**
 *
 * @method replaceSQSTags
 * @param {string} rendered The template rendering
 * @param {object} pageJson JSON data for page
 * @returns {string}
 * @private
 *
 */
replaceSQSTags = function ( rendered, pageJson, pageHtml ) {
    var pageType = pageJson.item ? "item" : "collection",
        pageId = pageJson.item ? pageJson.item.id : pageJson.collection.id,
        bodyElem = pageHtml.match( rBodyTag ),
        bodyAttr = sqsUtil.getAttrObj( bodyElem[ 0 ] );

    rendered = rendered.replace( SQS_MAIN_CONTENT, (pageJson.mainContent || "") );
    rendered = rendered.replace( SQS_POST_ENTRY, "" );
    rendered = rendered.replace( SQS_PAGE_CLASSES, bodyAttr.class );
    rendered = rendered.replace( SQS_PAGE_ID, (pageType + "-" + pageId) );

    return rendered;
},


/**
 *
 * @method getTemplateKey
 * @param {object} pageJson JSON data for page
 * @private
 *
 */
getTemplateKey = function ( pageJson ) {
    var template = "",
        typeName = null,
        regionName = null;

    // This could happen, I suppose...
    if ( !pageJson ) {
        return template;
    }

    // Grab the collection typeName
    typeName = pageJson.collection.typeName;

    // Grab the regionName
    regionName = (pageJson.collection.regionName || "default");

    // Handle collection item
    if ( pageJson.item ) {
        template = (typeName + ".item");

    // Handle collection list
    } else if ( pageJson.items ) {
        template = (typeName + ".list");

    // Handle collection root
    } else {
        // Handle static page
        if ( pageJson.collection.type === sqsCollectiontypes.TEMPLATE_PAGE ) {
            template = (typeName + ".page");

        } else {
            template = (regionName + ".region");
        }
    }

    return template;
},


/**
 *
 * @method setHeaderFooterTokens
 * @param {object} pageJson JSON data for page
 * @param {string} pageHtml HTML for page
 * @returns {string}
 * @private
 *
 */
setHeaderFooterTokens = function ( pageJson, pageHtml ) {
    var tokenHeadersFull = sqsUtil.getToken(),
        tokenFootersFull = sqsUtil.getToken(),
        tokenStyleTag = sqsUtil.getToken(),
        sHeadersFull = pageHtml.match( rSQSHeadersFull ),
        sFootersFull = pageHtml.match( rSQSFootersFull ),
        siteStyleTag = null;

    // Headers?
    if ( sHeadersFull ) {
        sHeadersFull = sHeadersFull[ 0 ];

        // Override isWrappedForDamask to ensure public site loads
        if ( config.server.sandbox ) {
            sHeadersFull = sHeadersFull.replace(
                'Squarespace.load(window);',
                'Squarespace.isWrappedForDamask=function(){return true;};Squarespace.load(window);'
            );
        }
        sqsHeaders.push( tokenHeadersFull );
        scripts.push({
            token: tokenHeadersFull,
            script: sHeadersFull
        });

        sqsHeaders.push( tokenStyleTag );
        scripts.push({
            token: tokenStyleTag,
            script: '<link href="/site.css" rel="stylesheet" />'
        });
    }

    // Footers?
    if ( sFootersFull ) {
        sqsFooters.push( tokenFootersFull );
        scripts.push({
            token: tokenFootersFull,
            script: sFootersFull[ 0 ]
        });
    }
},


/**
 *
 * @method replaceNavigations
 * @param {string} rendered The template rendering
 * @param {string} pageJson The JSON for the page
 * @returns {string}
 * @private
 *
 */
replaceNavigations = function ( rendered, pageJson ) {
    var context = {
            active: false,
            folderActive: false,
            website: pageJson.website,
            items: [],
            extras: {},
            nodeServer: true
        },
        block,
        attrs,
        matched,
        template,
        i,
        iLen,
        j;

    // SQS Navigations
    matched = rendered.match( rSQSNavis );

    if ( matched ) {
        for ( i = 0, iLen = matched.length; i < iLen; i++ ) {
            attrs = sqsUtil.getAttrObj( matched[ i ] );
            block = (attrs.template + ".block");
            template = templates.blocks[ block ];

            for ( j = config.server.siteData.siteLayout.layout.length; j--; ) {
                // Ensure the identifier is for THIS navigation ID
                if ( config.server.siteData.siteLayout.layout[ j ].identifier === attrs.navigationId ) {
                    context.items = getNavigationContextItems(
                        config.server.siteData.siteLayout.layout[ j ].links,
                        pageJson
                    );
                }
            }

            template = sqsJsonTemplate.render( template, context );

            rendered = rendered.replace( matched[ i ], template );
        }
    }

    return rendered;
},


/**
 *
 * @method replaceFolderNavigations
 * @param {string} rendered The template rendering
 * @param {string} pageJson The JSON for the page
 * @returns {string}
 * @private
 *
 */
replaceFolderNavigations = function ( rendered, pageJson ) {
    var context = {
            active: false,
            folderActive: false,
            website: pageJson.website,
            items: [],
            extras: {},
            nodeServer: true
        },
        block,
        attrs,
        matched,
        template,
        i,
        iLen,
        j,

        nav,
        links,
        link,

        k,
        l,

        child;

    // SQS Folder Navigations
    matched = rendered.match( rSQSFolderNavis );

    if ( matched ) {
        for ( i = 0, iLen = matched.length; i < iLen; i++ ) {
            attrs = sqsUtil.getAttrObj( matched[ i ] );
            block = (attrs.template + ".block");
            template = templates.blocks[ block ];

            // Iterate over SiteLayout indexes/folders
            // Find index/folder that has current collection as child
            // Use that children array to render the navigation

            // Iterates over ALL registered navigations in a site
            for ( j = config.server.siteData.siteLayout.layout.length; j--; ) {
                nav = config.server.siteData.siteLayout.layout[ j ];
                links = nav.links;

                for ( k = links.length; k--; ) {
                    link = links[ k ];

                    if ( rIndexFolder.test( link.typeName ) ) {
                        // Indexes and Folders can potentially NOT have children
                        // https://github.com/NodeSquarespace/node-squarespace-server/issues/130
                        if ( link.children ) {
                            for ( l = link.children.length; l--; ) {
                                child = link.children[ l ];

                                if ( child.collectionId === pageJson.collection.id ) {
                                    context.items = getNavigationContextItems(
                                        link.children,
                                        pageJson
                                    );
                                }
                            }
                        }
                    }
                }
            }

            template = sqsJsonTemplate.render( template, context );

            rendered = rendered.replace( matched[ i ], template );
        }
    }

    return rendered;
},


/**
 *
 * @method getNavigationContextItems
 * @param {array} links The list of links for a navigation tree
 * @param {string} pageJson The JSON for the page
 * @returns {array}
 * @private
 *
 */
getNavigationContextItems = function ( links, pageJson ) {
    var items = [],
        i,
        iLen,
        j,
        jLen;

    for ( i = 0, iLen = links.length; i < iLen; i++ ) {
        var link = links[ i ],
            item = null;

        // Render item with a collection ID
        if ( link.collectionId ) {
            item = {
                active: (link.collectionId === pageJson.collection.id),
                folderActive: (link.collectionId === pageJson.collection.id),
                collection: lookupCollectionById( link.collectionId )
            };

            // Check for folder submenu items
            if ( link.children ) {
                item.items = [];

                for ( j = 0, jLen = link.children.length; j < jLen; j++ ) {
                    item.items.push({
                        active: (link.children[ j ].collectionId === pageJson.collection.id),
                        folderActive: (link.children[ j ].collectionId === pageJson.collection.id),
                        collection: lookupCollectionById( link.children[ j ].collectionId )
                    });

                    // Need active folder when collection in a folder is active
                    if ( link.children[ j ].collectionId === pageJson.collection.id ) {
                        item.active = (link.children[ j ].collectionId === pageJson.collection.id);
                        item.folderActive = (link.children[ j ].collectionId === pageJson.collection.id);
                    }
                }
            }

        } else {
            item = sqsUtil.copy( link );
            item.active = (link.title === pageJson.collection.title);
            item.folderActive = (link.title === pageJson.collection.title);
        }

        items.push( item );
    }

    return items;
},


/**
 *
 * @method getBlockTypeName
 * @param {number} type The type number
 * @returns {string}
 * @private
 *
 */
getBlockTypeName = function ( type ) {
    var ret = "";

    for ( var t in sqsBlocktypes ) {
        if ( type === sqsBlocktypes[ t ] ) {
        	ret = t.toLowerCase().replace( /_/g, "-" );
        	break;
        }
    }

    return ret;
},


/**
 *
 * @method replaceBlockFields
 * @param {string} rendered The template rendering
 * @param {object} qrs The query string from the request
 * @param {function} callback The callback when done rendering
 * @private
 *
 */
replaceBlockFields = function ( rendered, qrs, callback ) {
    var blockMatch = null,
        blockData = null,
        blockAttrs = null,
        matched = rendered.match( rSQSBlockFields ),
        widgets = {},
        blocks = [],
        r,
        r2,
        rLen,
        rLen2,
        c,
        c2,
        cLen,
        cLen2,
        b,
        b2,
        bLen,
        bLen2;

    if ( matched ) {
        function getWidget() {
            var block = blocks.shift();

            sqsMiddleware.getWidgetHtml( block, function ( error, json ) {
                var layout;

                if ( !error ) {
                    widgets[ block.id ] = json.html;

                    if ( !blocks.length ) {
                        for ( r = 0; r < rLen; r++ ) {
                            cLen = blockData.data.layout.rows[ r ].columns.length;

                            for ( c = 0; c < cLen; c++ ) {
                                // Check layout, we need to account for multi-column
                                // This is where it breaks the mold of single column
                                if ( blockData.data.layout.rows[ r ].columns[ c ].rows ) {
                                    rLen2 = blockData.data.layout.rows[ r ].columns[ c ].rows.length;

                                    for ( r2 = 0; r2 < rLen2; r2++ ) {
                                        cLen2 = blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns.length;

                                        for ( c2 = 0; c2 < cLen2; c2++ ) {
                                            bLen2 = blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks.length;

                                            for ( b2 = 0; b2 < bLen2; b2++ ) {
                                                blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks[ b2 ].blockJson = JSON.stringify( blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks[ b2 ].value ).replace( /"/g, "&quot;" );
                                                blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks[ b2 ].typeName = getBlockTypeName( blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks[ b2 ].type );
                                                blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks[ b2 ].widgetHtml = widgets[ blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks[ b2 ].id ];
                                            }
                                        }
                                    }

                                } else {
                                    bLen = blockData.data.layout.rows[ r ].columns[ c ].blocks.length;

                                    for ( b = 0; b < bLen; b++ ) {
                                        blockData.data.layout.rows[ r ].columns[ c ].blocks[ b ].blockJson = JSON.stringify( blockData.data.layout.rows[ r ].columns[ c ].blocks[ b ].value ).replace( /"/g, "&quot;" );
                                        blockData.data.layout.rows[ r ].columns[ c ].blocks[ b ].typeName = getBlockTypeName( blockData.data.layout.rows[ r ].columns[ c ].blocks[ b ].type );
                                        blockData.data.layout.rows[ r ].columns[ c ].blocks[ b ].widgetHtml = widgets[ blockData.data.layout.rows[ r ].columns[ c ].blocks[ b ].id ];
                                    }
                                }
                            }
                        }

                        layout = mustache.render( layoutHTML, {
                            attrs: blockAttrs,
                            data: blockData.data
                        });

                        rendered = rendered.replace( blockMatch, layout );

                        sqsCache.set( ("block-" + blockAttrs.id + ".html"), layout );

                        if ( !matched.length ) {
                            callback( rendered );

                        } else {
                            getBlocks();
                        }
                        
                    } else {
                        getWidget();
                    }

                } else {
                    // Handle errors
                    sqsLogger.log( "error", ("Error requesting block widget html => " + error) );

                    // Skip it for now...
                    if ( !blocks.length ) {
                        if ( !matched.length ) {
                            callback( rendered );

                        } else {
                            getBlocks();
                        }

                    } else {
                        getWidget();
                    }
                }
            });
        }

        function getBlocks() {
            var block = matched.shift(),
                blockHtml;

            blockAttrs = sqsUtil.getAttrObj( block );
            blockAttrs.columns = (12 / blockAttrs.columns);
            blockMatch = block;
            blockHtml = sqsCache.get( ("block-" + blockAttrs.id + ".html") );

            if ( blockHtml && qrs.nocache === undefined ) {
                rendered = rendered.replace( blockMatch, blockHtml );

                if ( !matched.length ) {
                    callback( rendered );

                } else {
                    getBlocks();
                }

            } else {
                blocks = [];
                widgets = {};

                sqsMiddleware.getBlockJson( blockAttrs.id, function ( error, json ) {
                    if ( !error ) {
                        blockData = json;

                        rLen = blockData.data.layout.rows.length;

                        for ( r = 0; r < rLen; r++ ) {
                            cLen = blockData.data.layout.rows[ r ].columns.length;

                            for ( c = 0; c < cLen; c++ ) {
                                // Check layout, we need to account for multi-column
                                // This is where it breaks the mold of single column
                                if ( blockData.data.layout.rows[ r ].columns[ c ].rows ) {
                                    rLen2 = blockData.data.layout.rows[ r ].columns[ c ].rows.length;

                                    for ( r2 = 0; r2 < rLen2; r2++ ) {
                                        cLen2 = blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns.length;

                                        for ( c2 = 0; c2 < cLen2; c2++ ) {
                                            bLen2 = blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks.length;

                                            for ( b2 = 0; b2 < bLen2; b2++ ) {
                                                blocks.push( blockData.data.layout.rows[ r ].columns[ c ].rows[ r2 ].columns[ c2 ].blocks[ b2 ] );
                                            }
                                        }
                                    }

                                } else {
                                    bLen = blockData.data.layout.rows[ r ].columns[ c ].blocks.length;

                                    for ( b = 0; b < bLen; b++ ) {
                                        blocks.push( blockData.data.layout.rows[ r ].columns[ c ].blocks[ b ] );
                                    }
                                }
                            }
                        }

                        getWidget();

                    } else {
                        // Handle errors
                        sqsLogger.log( "error", ("Error requesting block json => " + error) );

                        if ( !matched.length ) {
                            callback( rendered );

                        } else {
                            getBlocks();
                        }
                    }
                });
            }
        }

        getBlocks();

    } else {
        callback( rendered );
    }
},


/**
 *
 * @method lookupCollectionById
 * @param {string} id The collection ID
 * @returns {object}
 * @private
 *
 */
lookupCollectionById = function ( id ) {
    var collection = null;

    for ( var i in config.server.siteData.collections.collections ) {
        if ( i === id ) {
            collection = config.server.siteData.collections.collections[ id ];
            break;
        }
    }

    return collection;
};


/******************************************************************************
 * @Export
*******************************************************************************/
module.exports = {
    watch: watch,
    preload: preload,
    compile: compile,
    refresh: refresh,
    setDirs: setDirs,
    setUser: setUser,
    setConfig: setConfig,
    setLogger: setLogger,
    getSiteCss: getSiteCss,
    replaceBlocks: replaceBlocks,
    replaceScripts: replaceScripts,
    renderTemplate: renderTemplate,
    replaceSQSScripts: replaceSQSScripts
};
