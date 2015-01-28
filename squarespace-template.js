/*!
 *
 * Squarespace template.
 *
 */
var _ = require( "underscore" ),
    path = require( "path" ),
    fs = require( "fs" ),
    less = require( "less" ),
    uglifycss = require( "uglifycss" ),
    mustache = require( "mustache" ),
    sqsMiddleware = require( "node-squarespace-middleware" ),
    functions = require( "./lib/functions" ),
    blocktypes = require( "./lib/blocktypes" ),
    sqsRender = require( "./squarespace-render" ),
    rSlash = /^\/|\/$/g,
    rJsonT = /^\{.*?\}$/,
    rHeader = /header/,
    rFooter = /footer/,
    rScripts = /<script.*?\>(.*?)<\/script\>/g,
    rBlockIncs = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rTplFiles = /\.item$|\.list$|\.region$|__HEADER$|__FOOTER$/,
    rItemOrList = /\.item$|\.list$/,
    rRegions = /\.region$/,
    rItem = /\.item$/,
    rList = /\.list$/,
    rLess = /\.less$/,
    rJson = /\{@\|json.*?\}/,
    rBodyTag = /<body.*?\>/,
    rSQSQuery = /(<squarespace:query.*?\>)(.*?)(<\/squarespace:query\>)/,
    rSQSNavis = /<squarespace:navigation(.*?)\/\>/g,
    rSQSBlockFields = /<squarespace:block-field(.*?)\/\>/g,
    rSQSScripts = /<squarespace:script(.*?)\/\>/g,
    rSQSClickThroughUrl = /\/s\/(.*?)\.\w+.*?/g,
    rSQSFootersFull = /<script type="text\/javascript" data-sqs-type="imageloader"\>(.*)<\/script\>/,
    rSQSHeadersFull = /<\!-- This is Squarespace\. -->(.*?)<\!-- End of Squarespace Headers -->/,
    SQS_HEADERS = "{squarespace-headers}",
    SQS_FOOTERS = "{squarespace-footers}",
    SQS_MAIN_CONTENT = "{squarespace.main-content}",
    SQS_PAGE_CLASSES = "{squarespace.page-classes}",
    SQS_PAGE_ID = "{squarespace.page-id}",
    SQS_POST_ENTRY = "{squarespace-post-entry}",
    sqsHeaders = [],
    sqsFooters = [],
    sqsUser = null,
    directories = {},
    config = {},
    scripts = [],
    siteCss = null,
    templates = {},


/******************************************************************************
 * @Public
*******************************************************************************/

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
        bodyAttr = functions.getAttrObj( bodyElem[ 0 ] );

    rendered = rendered.replace( SQS_MAIN_CONTENT, pageJson.mainContent );
    rendered = rendered.replace( SQS_POST_ENTRY, "" );
    rendered = rendered.replace( SQS_PAGE_CLASSES, bodyAttr.class );

    // In case fools be using this #id more than once, WTF :-P
    rendered = rendered.replace( new RegExp( SQS_PAGE_ID, "g" ), (pageType + "-" + pageId) );

    return rendered;
},


/**
 *
 * @method compileCollections
 * @public
 *
 */
compileCollections = function () {
    var collections = fs.readdirSync( directories.collections ),
        file = null;

    for ( var i = collections.length; i--; ) {
        if ( rItemOrList.test( collections[ i ] ) ) {
            file = path.join( directories.collections, collections[ i ] );

            if ( fs.existsSync( file ) ) {
                templates[ collections[ i ] ] = functions.readFileSquashed( file );
            }
        }
    }
},


/**
 *
 * @method compileRegions
 * @public
 *
 */
compileRegions = function () {
    var files = null,
        file = null,
        link = null;

    for ( var i in config.template.layouts ) {
        files = config.template.layouts[ i ].regions;
        file = "";
        link = (i + ".region");

        for ( j = 0, len = files.length; j < len; j++ ) {
            // Skip header / footer regions since we parsed them earlier
            // templates.__HEADER
            // templates.__FOOTER
            if ( !rHeader.test( files[ j ] ) && !rFooter.test( files[ j ] ) ) {
                file += functions.readFileSquashed( path.join( config.server.webroot, (files[ j ] + ".region") ) );
            }
        }

        templates[ link ] = file;
    }
},


/**
 *
 * @method replaceBlocks
 * @public
 *
 */
replaceBlocks = function () {
    var matched,
        block,
        filed;

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        while ( matched = templates[ i ].match( rBlockIncs ) ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                block = matched[ j ].replace( rBlockTags, "" );
                filed = functions.readFileSquashed( path.join( directories.blocks, block ) );

                templates[ i ] = templates[ i ].replace( matched[ j ], filed );
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

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        matched = templates[ i ].match( rScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                if ( !rJson.test( matched[ j ] ) ) {
                    token = functions.getToken();
                    scripts.push({
                        token: token,
                        script: matched[ j ]
                    });

                    templates[ i ] = templates[ i ].replace( matched[ j ], token );
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

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        matched = templates[ i ].match( rSQSScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                attrs = functions.getAttrObj( matched[ j ] );
                block = ( "/scripts/" + attrs.src );
                filed = '<script src="' + block + '"></script>';

                templates[ i ] = templates[ i ].replace( matched[ j ], filed );
            }
        }
    }
},


/**
 *
 * @method getTemplateKey
 * @param {object} pageJson JSON data for page
 * @public
 *
 */
getTemplateKey = function ( pageJson ) {
    var template = null,
        regcheck = null,
        typeName = null,
        regionName = null;

    // This could happen, I suppose...
    if ( !pageJson ) {
        functions.log( "TEMPLATE - Page JSON UNDEFINED" );
        return;
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

    // Handle page
    } else {
        template = (regionName + ".region");
    }

    functions.log( "TEMPLATE - " + template );

    return template;
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
    var queries = [],
        templateKey = getTemplateKey( pageJson ),
        rendered = "",
        matched = null,
        regionKey;

    if ( templates.__HEADER ) {
        rendered += templates.__HEADER;
    }

    // 0.1 => Template is a list or item for a collection, NOT a region
    // What we are doing here is replicating the injection point for {squarespace.main-content} on collections
    if ( rItemOrList.test( templateKey ) ) {
        regionKey = ((pageJson.collection.regionName || "default") + ".region");

        // This wraps the matched collection template with the default or set region
        rendered += templates[ regionKey ].replace( SQS_MAIN_CONTENT, templates[ templateKey ] );

    } else {
        rendered += templates[ templateKey ];
    }

    if ( templates.__FOOTER ) {
        rendered += templates.__FOOTER;
    }

    // SQS Tags?
    rendered = replaceSQSTags( rendered, pageJson, pageHtml );

    // Queries
    // 0 => Full
    // 1 => Open
    // 2 => Template
    // 3 => Close
    while ( matched = rendered.match( rSQSQuery ) ) {
        rendered = rendered.replace( matched[ 0 ], matched[ 2 ] );

        queries.push( matched );
    }

    function handleDone() {
        // Create {squarespace-headers} / {squarespace-footers}
        setHeaderFooterTokens( pageJson, pageHtml );

        // Render {squarespace-headers} to the best of our ability
        rendered = rendered.replace( SQS_HEADERS, sqsHeaders.join( "" ) );

        // Render {squarespace-footers} to the best of our ability
        rendered = rendered.replace( SQS_FOOTERS, sqsFooters.join( "" ) );

        // Render Navigations from pageJson
        rendered = replaceNavigations( rendered, pageJson );

        // Render full clickThroughUrl's
        rendered = replaceClickThroughUrls( rendered );

        // Render w/jsontemplate
        rendered = sqsRender.renderJsonTemplate( rendered, pageJson );

        // Add token scripts back into the template
        for ( var i = scripts.length; i--; ) {
            rendered = rendered.replace( scripts[ i ].token, scripts[ i ].script );
        }

        // Render Block Fields
        replaceBlockFields( rendered, qrs, function ( finalRender ) {
            callback( finalRender );
        });
    }

    function handleQueried() {
        if ( !queries.length ) {
            handleDone();
            return;
        }

        var query = queries.shift(),
            queryData = functions.getAttrObj( query[ 1 ] ),
            jsonTMatch = queryData.collection.match( rJsonT ),
            cacheSlug = "",
            tpl;

        if ( jsonTMatch ) {
            jsonTMatch = jsonTMatch[ 0 ];

            queryData.collection = sqsRender.renderJsonTemplate( jsonTMatch, pageJson );
        }

        cacheSlug = ("query-" + queryData.collection);

        for ( var i in qrs ) {
            // Skip password in unique cache
            if ( i !== "format" && i !== "password" && i !== "nocache" ) {
                cacheSlug += ("-" + i + "--" + qrs[ i ]);
            }
        }

        // Tag?
        if ( queryData.tag ) {
            cacheSlug += "-tag--" + queryData.tag;
        }

        // Category?
        if ( queryData.category ) {
            cacheSlug += "-category--" + queryData.category;
        }

        cacheSlug = path.join( config.server.cacheroot, (cacheSlug + ".json") );

        // Cached?
        if ( fs.existsSync( cacheSlug ) && qrs.nocache === undefined ) {
            functions.log( "CACHE - Loading cached query" );

            json = functions.readJson( cacheSlug );

            tpl = sqsRender.renderJsonTemplate( query[ 2 ], json );

            rendered = rendered.replace( query[ 2 ], tpl );

            handleQueried();

        } else {
            if ( qrs.nocache !== undefined ) {
                functions.log( "CACHE - Clearing cached query: ", queryData.collection );
            }

            sqsMiddleware.getQuery( queryData, qrs, function ( error, json ) {
                functions.log( "QUERY - " + queryData.collection );

                if ( !error ) {
                    functions.writeJson( cacheSlug, json );

                    tpl = sqsRender.renderJsonTemplate( query[ 2 ], json );

                    rendered = rendered.replace( query[ 2 ], tpl );

                    handleQueried();

                } else {
                    // Handle errors
                    functions.log( "ERROR - " + error );
                }
            });
        }
    }

    if ( queries.length ) {
        handleQueried();

    } else {
        handleDone();
    }
},


/**
 *
 * @method compileStylesheets
 * @public
 *
 */
compileStylesheets = function () {
    var reset = path.join( directories.styles, "reset.css" ),
        fpath,
        file;

    siteCss = "";

    if ( fs.existsSync( reset ) ) {
        siteCss += uglifycss.processString( functions.readFileSquashed( reset ) );

        functions.log( "CSS - reset" );
    }

    for ( var i = 0, len = config.template.stylesheets.length; i < len; i++ ) {
        fpath = path.join( directories.styles, config.template.stylesheets[ i ] );

        if ( !fs.existsSync( fpath ) ) {
            continue;
        }

        file = ("" + fs.readFileSync( fpath ));

        if ( rLess.test( config.template.stylesheets[ i ] ) ) {
            less.render( file, function ( error, css ) {
                siteCss += css;
            });

            functions.log( ("LESS - " + config.template.stylesheets[ i ]) );

        } else {
            siteCss += uglifycss.processString( file );

            functions.log( ("CSS - " + config.template.stylesheets[ i ]) );
        }
    }
},


/**
 *
 * @method setSQSHeadersFooters
 * @public
 *
 */
setSQSHeadersFooters = function () {
    scripts = [];
    sqsHeaders = [];
    sqsFooters = [];
},


/**
 *
 * @method setHeaderFooter
 * @public
 *
 */
setHeaderFooter = function () {
    var files = fs.readdirSync( config.server.webroot );

    for ( i = files.length; i--; ) {
        if ( rRegions.test( files[ i ] ) && rHeader.test( files[ i ] ) ) {
            templates.__HEADER = functions.readFileSquashed( path.join( config.server.webroot, files[ i ] ) );

        } else if ( rRegions.test( files[ i ] ) && rFooter.test( files[ i ] ) ) {
            templates.__FOOTER = functions.readFileSquashed( path.join( config.server.webroot, files[ i ] ) );
        }
    }
},


/******************************************************************************
 * @Private
*******************************************************************************/

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
    var tokenHeadersFull = functions.getToken(),
        tokenFootersFull = functions.getToken(),
        tokenStyleTag = functions.getToken(),
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
            items: []
        },
        block,
        items,
        attrs,
        matched,
        template,
        i,
        iLen,
        j,
        k,
        kLen,
        l,
        lLen;

    // SQS Navigations
    matched = rendered.match( rSQSNavis );

    if ( matched ) {
        for ( i = 0, iLen = matched.length; i < iLen; i++ ) {
            attrs = functions.getAttrObj( matched[ i ] );
            block = (attrs.template + ".block");
            template = functions.readFileSquashed( path.join( directories.blocks, block ) );

            for ( j = config.server.siteData.siteLayout.layout.length; j--; ) {
                // Ensure the identifier is for THIS navigation ID
                if ( config.server.siteData.siteLayout.layout[ j ].identifier === attrs.navigationId ) {
                    items = [];

                    for ( k = 0, kLen = config.server.siteData.siteLayout.layout[ j ].links.length; k < kLen; k++ ) {
                        var link = config.server.siteData.siteLayout.layout[ j ].links[ k ],
                            item = null;

                        // Render item with a collection ID
                        if ( link.collectionId ) {
                            item = {
                                active: (link.collectionId === pageJson.collection.id),
                                folderActive: (link.collectionId === pageJson.collection.id),
                                collection: lookupCollection( link.collectionId )
                            };

                            // Check for folder submenu items
                            if ( link.children ) {
                                item.items = [];

                                for ( l = 0, lLen = link.children.length; l < lLen; l++ ) {
                                    item.items.push({
                                        active: (link.children[ l ].collectionId === pageJson.collection.id),
                                        folderActive: (link.children[ l ].collectionId === pageJson.collection.id),
                                        collection: lookupCollection( link.children[ l ].collectionId )
                                    });

                                    // Need active folder when collection in a folder is active
                                    if ( link.children[ l ].collectionId === pageJson.collection.id ) {
                                        item.active = (link.children[ l ].collectionId === pageJson.collection.id);
                                        item.folderActive = (link.children[ l ].collectionId === pageJson.collection.id);
                                    }
                                }
                            }

                        } else {
                            item = _.extend( link, {
                                active: (link.title === pageJson.collection.title),
                                folderActive: (link.title === pageJson.collection.title)
                            });
                        }

                        items.push( item );
                    }

                    context.items = items;
                }
            }

            template = sqsRender.renderJsonTemplate( template, context );

            rendered = rendered.replace( matched[ i ], template );
        }
    }

    return rendered;
},


/**
 *
 * @method replaceClickThroughUrls
 * @param {string} rendered The template rendering
 * @returns {string}
 * @private
 *
 */
replaceClickThroughUrls = function ( rendered ) {
    var matched = rendered.match( rSQSClickThroughUrl ),
        fullUrl;

    if ( matched ) {
        for ( i = 0, len = matched.length; i < len; i++ ) {
            fullUrl = (config.server.siteurl + matched[ i ]);

            rendered = rendered.replace( matched[ i ], fullUrl );
        }
    }

    return rendered;
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

    for ( var t in blocktypes ) {
        if ( type === blocktypes[ t ] ) {
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
    var layoutHtml = functions.readFileSquashed( path.join( __dirname, "tpl/layout.html" ) ),
        blockMatch = null,
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
                    functions.log( "WIDGET GET - ", block.id );

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

                        layout = mustache.render( layoutHtml, {
                            attrs: blockAttrs,
                            data: blockData.data
                        });

                        rendered = rendered.replace( blockMatch, layout );

                        functions.writeFile( path.join( config.server.cacheroot, ("block-" + blockAttrs.id + ".html") ), layout );

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
                    functions.log( "ERROR - " + error );

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
                blockPathHtml,
                blockHtml;

            blockAttrs = functions.getAttrObj( block );
            blockAttrs.columns = (12 / blockAttrs.columns);
            blockMatch = block;
            blockPathHtml = path.join( config.server.cacheroot, ("block-" + blockAttrs.id + ".html") );

            if ( fs.existsSync( blockPathHtml ) && qrs.nocache === undefined ) {
                functions.log( "BLOCK CACHE -", blockAttrs.id );

                blockHtml = functions.readFile( blockPathHtml );

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
                        functions.log( "BLOCK GET -", blockAttrs.id );

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
                        functions.log( "ERROR - " + error );

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
 * @method lookupCollection
 * @param {string} id The collection ID
 * @returns {object}
 * @private
 *
 */
lookupCollection = function ( id ) {
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
    setConfig: setConfig,
    setDirs: setDirs,
    setUser: setUser,
    getSiteCss: getSiteCss,
    compileCollections: compileCollections,
    compileRegions: compileRegions,
    replaceBlocks: replaceBlocks,
    replaceScripts: replaceScripts,
    replaceSQSScripts: replaceSQSScripts,
    getTemplateKey: getTemplateKey,
    renderTemplate: renderTemplate,
    compileStylesheets: compileStylesheets,
    setSQSHeadersFooters: setSQSHeadersFooters,
    setHeaderFooter: setHeaderFooter
};