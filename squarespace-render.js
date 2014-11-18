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
    },


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
renderJsonTemplate = function ( render, data ) {
    render = jsonTemplate.Template( render, jsontOptions );
    render = render.expand( data );

    return render;
};


/******************************************************************************
 * @Export
*******************************************************************************/
module.exports = {
    renderJsonTemplate: renderJsonTemplate
};