/*!
 *
 * Squarespace render.
 *
 */
var jsonTemplate = require( "./lib/jsontemplate" ),
    jsontOptions = {
        more_formatters: require( "./lib/formatters" ),
        more_predicates: require( "./lib/predicates" ),
        undefined_str: ""
    };


/******************************************************************************
 * @Public
*******************************************************************************/

/**
 *
 * @method renderJsonTemplate
 * @param {string} render The template string
 * @param {object} data The data context
 * @returns {string}
 * @public
 *
 */
function renderJsonTemplate( render, data ) {
    // TEMPORARY SOLUTION!
    // Formalize .if to .section and avoid json-template blowing up
    // This fixes issues with nested .repeated sections within a .if
    var match;

    while ( match = render.match( /\{\.if\s(.*?)\}/ ) ) {
        render = render.replace( match[ 0 ], "{.section " + match[ 1 ] + "}" );
        render = render.replace( new RegExp( "{.repeated section " + match[ 1 ] + "}" ), "{.repeated section @}" );
    }

    render = jsonTemplate.Template( render, jsontOptions );
    render = render.expand( data );

    return render;
}


/******************************************************************************
 * @Export
*******************************************************************************/
module.exports = {
    renderJsonTemplate: renderJsonTemplate
};