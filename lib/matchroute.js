/*!
 *
 * Handles wildcard route matching against urls with !num and !slug condition testing
 *
 * @MatchRoute
 * @author: kitajchuk
 *
 */
(function () {


"use strict";


var paramalama = require( "./paramalama" );


/**
 *
 * Handles wildcard route matching against urls with !num and !slug condition testing
 * <ul>
 * <li>route = "/some/random/path/:myvar"</li>
 * <li>route = "/some/random/path/:myvar!num"</li>
 * <li>route = "/some/random/path/:myvar!slug"</li>
 * </ul>
 * @constructor MatchRoute
 * @memberof! <global>
 * @requires paramalama
 *
 */
var MatchRoute = function () {
    return this.init.apply( this, arguments );
};

MatchRoute.prototype = {
    constructor: MatchRoute,
    
    /**
     *
     * Expression match http/https
     * @memberof MatchRoute
     * @member _rHTTPs
     * @private
     *
     */
    _rHTTPs: /^http[s]?:\/\/.*?\//,
    
    /**
     *
     * Expression match trail slashes
     * @memberof MatchRoute
     * @member _rTrails
     * @private
     *
     */
    _rTrails: /^\/|\/$/g,
    
    /**
     *
     * Expression match hashbang/querystring
     * @memberof MatchRoute
     * @member _rHashQuery
     * @private
     *
     */
    _rHashQuery: /#.*$|\?.*$/g,
    
    /**
     *
     * Expression match wildcards
     * @memberof MatchRoute
     * @member _rWild
     * @private
     *
     */
    _rWild: /^:/,
    
    /**
     *
     * Expressions to match wildcards with supported conditions
     * @memberof MatchRoute
     * @member _wilders
     * @private
     *
     */
    _wilders: {
        num: /^[0-9]+$/,
        slug: /^[A-Za-z]+[A-Za-z0-9-_.]*$/
    },
    
    
    /**
     *
     * MatchRoute init constructor method
     * @memberof MatchRoute
     * @method init
     * @param {array} routes Config routes can be passed on instantiation
     *
     */
    init: function ( routes ) {
        /**
         *
         * The routes config array
         * @memberof MatchRoute
         * @member _routes
         * @private
         *
         */
        this._routes = ( routes ) ? this._cleanRoutes( routes ) : [];
    },

    /**
     *
     * Get the internal route array
     * @memberof MatchRoute
     * @method MatchRoute.getRoutes
     * @returns {array}
     *
     */
    getRoutes: function () {
        return this._routes;
    },
    
    /**
     *
     * Update routes config array
     * @memberof MatchRoute
     * @method config
     * @param {array} routes to match against
     *
     */
    config: function ( routes ) {
        // Force array on routes
        routes = ( typeof routes === "string" ) ? [ routes ] : routes;

        this._routes = this._routes.concat( this._cleanRoutes( routes ) );
        
        return this;
    },
    
    /**
     *
     * Test a url against a routes config for match validation
     * @memberof MatchRoute
     * @method test
     * @param {string} url to test against routes
     * @returns True or False
     *
     */
    test: function ( url ) {
        return this.parse( url, this._routes ).matched;
    },
    
    /**
     *
     * Match a url against a routes config for matches
     * @memberof MatchRoute
     * @method params
     * @param {string} url to test against routes
     * @returns Array of matching routes
     *
     */
    params: function ( url ) {
        return this.parse( url, this._routes ).params;
    },
    
    /**
     *
     * Compare a url against a specific route
     * @memberof MatchRoute
     * @method compare
     * @param {string} route compare route
     * @param {string} url compare url
     * @returns MatchRoute.parse()
     *
     */
    compare: function ( route, url ) {
        return this.parse( url, [route] );
    },
    
    /**
     *
     * Parse a url for matches against config array
     * @memberof MatchRoute
     * @method parse
     * @param {string} url to test against routes
     * @param {array} routes The routes to test against
     * @returns Object witch match bool and matches array
     *
     */
    parse: function ( url, routes ) {
        var segMatches,
            params,
            match,
            route = this._cleanRoute( url ),
            ruris,
            regex,
            cond,
            uris = route.split( "/" ),
            uLen = uris.length,
            iLen = routes.length,
            ret;
        
        for ( var i = 0; i < iLen; i++ ) {
            // Start fresh each iteration
            // Only one matched route allowed
            ret = {
                matched: false,
                route: null,
                uri: [],
                params: {},
                query: paramalama( url )
            };
            
            ruris = routes[ i ].split( "/" );
            
            // Handle route === "/"
            if ( route === "/" && routes[ i ] === "/" ) {
                ret.matched = true;
                ret.route = routes[ i ];
                ret.uri = "/";
                
                break;
            }
            
            // If the actual url doesn't match the route in segment length,
            // it cannot possibly be considered for matching so just skip it
            if ( ruris.length !== uris.length ) {
                continue;
            }
            
            segMatches = 0;
            
            for ( var j = 0; j < uLen; j++ ) {
                // Matched a variable uri segment
                if ( this._rWild.test( ruris[ j ] ) ) {
                    // Try to split on conditions
                    params = ruris[ j ].split( "!" );
                    
                    // The variable segment
                    match = params[ 0 ];
                    
                    // The match condition
                    cond = params[ 1 ];
                    
                    // With conditions
                    if ( cond ) {
                        // We support this condition
                        if ( this._wilders[ cond ] ) {
                            regex = this._wilders[ cond ];
                        }
                        
                        // Test against the condition
                        if ( regex && regex.test( uris[ j ] ) ) {
                            segMatches++;
                            
                            // Add the match to the config data
                            ret.params[ match.replace( this._rWild, "" ) ] = uris[ j ];
                            ret.uri.push( uris[ j ] );
                        }
                    
                    // No conditions, anything goes   
                    } else {
                        segMatches++;
                        
                        // Add the match to the config data
                        ret.params[ match.replace( this._rWild, "" ) ] = uris[ j ];
                        ret.uri.push( uris[ j ] );
                    }
                
                // Defined segment always goes   
                } else {
                    if ( uris[ j ] === ruris[ j ] ) {
                        segMatches++;
                        
                        ret.uri.push( uris[ j ] );
                    }
                }
            }
            
            if ( segMatches === uris.length ) {
                ret.matched = true;
                ret.route = routes[ i ];
                ret.uri = ret.uri.join( "/" );
                
                break;
            }
        }
        
        return ret;
    },
    
    /**
     *
     * Clean a route string
     * If the route === "/" then it is returned as is
     * @memberof MatchRoute
     * @method _cleanRoute
     * @param {string} route the route to clean
     * @returns cleaned route string
     * @private
     *
     */
    _cleanRoute: function ( route ) {
        if ( route !== "/" ) {
            route = route.replace( this._rHTTPs, "" );
            route = route.replace( this._rTrails, "" );
            route = route.replace( this._rHashQuery, "" );
            route = route.replace( this._rTrails, "" );
        }
        
        if ( route === "" ) {
            route = "/";
        }
        
        return route;
    },
    
    /**
     *
     * Clean an array of route strings
     * @memberof MatchRoute
     * @method _cleanRoutes
     * @param {array} routes the routes to clean
     * @returns cleaned routes array
     * @private
     *
     */
    _cleanRoutes: function ( routes ) {
        for ( var i = routes.length; i--; ) {
            routes[ i ] = this._cleanRoute( routes[ i ] );
        }
        
        return routes;
    }
};


// Export
module.exports = new MatchRoute();


})();