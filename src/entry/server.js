import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { Provider } from 'react-redux';
import StaticRouter from 'react-router-dom/StaticRouter';
import matchPath from 'react-router-dom/matchPath';
import { ServerStyleSheet } from 'styled-components';
import { flushChunkNames } from 'react-universal-component/server';
import flushChunks from 'webpack-flush-chunks';
import chalk from 'chalk';

import configureStore from '../state/store';
import routes from '../routes';
import App from '../components/App';
import Html from '../components/Html';

import './serverPolyfill.js';

const log = console.log;

/**
 * Express middleware to render HTML
 * @param  {object}     stats Webpack stats output
 * @return {function}   middleware function
 */
// eslint-disable-next-line no-unused-vars
export default ({ clientStats }) => (req, res, next) => {
  global.navigator = { userAgent: req.headers['user-agent'] };

  const initialState = {};
  const store = configureStore(initialState);
  const sheet = new ServerStyleSheet();
  const reactRouterContext = {};

  const appComponent = (
    <Provider store={store} key="provider">
      <StaticRouter location={req.url} context={reactRouterContext}>
        <App />
      </StaticRouter>
    </Provider>
  );

  // Here is where our data loading begins
  log(chalk.dim('Matching routes and fetching data'));
  const matches = routes.reduce((matches, route) => {
    const match = matchPath(req.url, route.path, route);
    if (match && match.isExact) {
      const fetchData = route.component.fetchData || route.fetchData;
      matches.push({
        route,
        match,
        promise: fetchData ? fetchData({ store, params: match.params }) : Promise.resolve(),
      });
    }
    return matches;
  }, []);

  // Any AJAX calls inside components
  const promises = matches.map(match => {
    return match.promise;
  });

  // Resolve the AJAX calls and render
  Promise.all(promises).then(async () => {
    let markup = '';
    try {
      // render the applicaation to a string and let styled-components
      // create stylesheet tags
      markup = await ReactDOMServer.renderToString(sheet.collectStyles(appComponent));
    } catch (err) {
      console.error('Unable to render server side React:', err);
    }

    log(chalk.dim('Flushing chunks...'));
    const chunkNames = flushChunkNames();
    const { scripts, stylesheets, cssHashRaw } = flushChunks(clientStats, { chunkNames });

    // get our "finalState" containing data loaded on the server
    const finalState = store.getState();

    // render to stream, collect styled-components css, send assets, and "raw" application component.
    const html = ReactDOMServer.renderToNodeStream(
      <Html
        styles={stylesheets}
        cssHash={cssHashRaw}
        js={scripts}
        styleTags={sheet.getStyleElement()}
        nonce={res.locals.nonce}
        component={markup}
        state={finalState}
      />,
    );

    switch (reactRouterContext.status) {
      case 301:
      case 302:
        res.status(reactRouterContext.status);
        res.location(reactRouterContext.url);
        res.end();
        break;
      case 404:
        res.status(reactRouterContext.status);
        res.type('html');
        res.write('<!doctype html>');
        html.pipe(res);
        break;
      default:
        res.status(200);
        res.type('html');
        res.setHeader('Cache-Control', 'no-cache');
        res.write('<!doctype html>');
        html.pipe(res);
    }
    log(chalk.green('Streaming app to browser'));
  });
};
