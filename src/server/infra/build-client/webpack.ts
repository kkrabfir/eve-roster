import path from "path";

import { ProjectPaths } from "./paths.js";

import webpack from "webpack";
import { CleanWebpackPlugin } from "clean-webpack-plugin";
import MomentLocalesPlugin from "moment-locales-webpack-plugin";

import { VueLoaderPlugin } from "vue-loader";

import HtmlWebpackPlugin from "html-webpack-plugin";
import HtmlWebpackPugPlugin from "html-webpack-pug-plugin";

import MiniCssExtractPlugin from "mini-css-extract-plugin";
import CssMinimizerPlugin from "css-minimizer-webpack-plugin";
import CleanupMiniCssExtractPlugin from "cleanup-mini-css-extract-plugin";

import ImageMinimizerPlugin from "image-minimizer-webpack-plugin";

import { createRequire } from "module";
const require = createRequire(import.meta.url);

export function commonConfig(
  mode: "development" | "production",
  paths: ProjectPaths
): webpack.Configuration {
  return {
    // webpack gives us a lot of nice built-in behavior depending on whether
    // this is "development" or "production"
    mode: mode,

    // Main entry point of the app; the transitive dependencies of this file
    // determine what we include in the compiled bundle.
    entry: {
      main: path.join(paths.clientSrc, "home.ts"),
      login: path.join(paths.clientSrc, "login.ts"),
    },

    output: {
      // Directory to write compiled JS and any static assets to
      path: paths.output,

      // The name of the final compiled bundle
      filename: "[name].[contenthash].js",

      // Public URL where compiled assets will be hosted (so they can refer to
      // one another).
      publicPath: paths.public,
    },

    module: {
      rules: [
        {
          test: /\.tsx?$/,
          loader: "ts-loader",
          options: {
            appendTsSuffixTo: [/\.vue$/],
            configFile: path.join(paths.clientSrc, "tsconfig.json"),
            projectReferences: true,
          },
          exclude: /node_modules/,
        },

        // Compilation for Vue single file components (*.vue)
        {
          test: /\.vue$/,
          loader: "vue-loader",
          options: {
            enableTsInTemplate: false,
          },
        },

        // SASS and CSS files from Vue Single File Components:
        {
          test: /\.vue\.(s?[ac]ss)$/,
          use: [
            "vue-style-loader",
            // Converts url() and import@ references to dependencies and changes
            // them to refer to the final output filenames
            "css-loader",
          ],
        },
        // SASS and CSS files (standalone):
        {
          test: /(?<!\.vue)\.(s?[ac]ss)$/,
          use: [
            MiniCssExtractPlugin.loader,
            // Converts url() and import@ references to dependencies and changes
            // them to refer to the final output filenames
            "css-loader",
          ],
        },

        // Images
        // TODO: Check if we want to include the hash here
        {
          test: /\.(png|jpg|gif|svg)$/,
          type: "asset",
        },
      ],
    },

    plugins: [
      // Cleans up any obsolete build artifacts (e.g. images that have since been
      // deleted).
      new CleanWebpackPlugin(),
      new CleanupMiniCssExtractPlugin(),

      // Required for loading .vue files
      new VueLoaderPlugin(),

      // We use the `moment` library for timekeeping, which by default includes
      // a ton of localization information we don't need (and which would bloat
      // the compiled binary). This plugin strips out all non-:'en'
      // localizations.
      new MomentLocalesPlugin(),

      // If the following constants appear in code, they will be rewritten to
      // the specified literals.
      new webpack.DefinePlugin({
        DEVELOPMENT: JSON.stringify(mode == "development"),
        "process.env.NODE_ENV": JSON.stringify(mode),
        __VUE_OPTIONS_API__: true,
        __VUE_PROD_DEVTOOLS__: true,
      }),

      new HtmlWebpackPlugin({
        template: path.join(paths.clientSrc, "views/home.pug"),
        favicon: path.join(paths.clientSrc, "res/favicon.ico"),
        filename: "home.pug",
        minify: false,
        chunks: ["main"],
      }),

      new HtmlWebpackPlugin({
        template: path.join(paths.clientSrc, "views/login.pug"),
        favicon: path.join(paths.clientSrc, "res/favicon.ico"),
        filename: "login.pug",
        minify: false,
        chunks: ["login"],
      }),

      // Allows HtmlWebpackPlugin to understand pug templates
      new HtmlWebpackPugPlugin(),

      new ImageMinimizerPlugin({
        minimizer: [
          {
            // `sharp` will handle all bitmap formats (JPG, PNG, GIF, ...)
            implementation: ImageMinimizerPlugin.sharpMinify,
          },
          {
            // `svgo` will handle vector images (SVG)
            implementation: ImageMinimizerPlugin.svgoMinify,
            options: {
              encodeOptions: {
                multipass: true,
                plugins: ["preset-default"],
              },
            },
          },
        ],
      }),
    ],

    stats: {
      modules: false,
      errorDetails: true,
    },
    performance: {
      hints: false,
    },
    optimization: {
      minimize: true,
      minimizer: [new MiniCssExtractPlugin(), new CssMinimizerPlugin(), "..."],
      moduleIds: "deterministic",
      runtimeChunk: "single",
      splitChunks: {
        minSize: 10000,
        maxSize: 250000,
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendor",
            chunks: "all",
          },
        },
      },
    },

    resolve: {
      // Files with these extensions can be imported without specifying the
      // extension (e.g. "./foo" vs. "./foo.ts");
      extensions: [".tsx", ".ts", ".js", ".json"],
      alias: {
        vue: "@vue/runtime-dom",
      },
      fallback: {
        buffer: require.resolve("buffer"),
        events: require.resolve("events"),
        fs: false,
        stream: require.resolve("stream-browserify"),
        url: require.resolve("url"),
      },
    },
  };
}
