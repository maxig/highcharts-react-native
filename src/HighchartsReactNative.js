import React from 'react';
import {
    Text,
    View,
    Dimensions,
    StyleSheet,
    Platform
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import AssetUtils from 'expo-asset-utils';

const win = Dimensions.get('window');
const cdnPath = 'https://code.highcharts.com/';
const path = '../highcharts-files/';
const highchartsLayout = `
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=0" />
    <link rel="stylesheet" type="text/css" href="css/styles.css">
    <script>
        const hcUtils = {
            // convert string to JSON, including functions.
            parseOptions: function (chartOptions) {
                const parseFunction = this.parseFunction;

                var options = JSON.parse(chartOptions, function (val, key) {
                    if (typeof key === 'string' && key.indexOf('function') > -1) {
                        return parseFunction(key);
                    } else {
                        return key;
                    }
                });

                return options;
            },
            // convert funtion string to function
            parseFunction: function (fc) {

                var fcArgs = fc.match(/\((.*?)\)/)[1],
                    fcbody = fc.split('{');

                return new Function(fcArgs, '{' + fcbody.slice(1).join('{'));
            }
        };

        // Communication between React app and webview. Receive chart options as string.
        document.addEventListener('message', function (data) {
            Highcharts.charts[0].update(
                hcUtils.parseOptions(data.data)
            );
        });

        window.addEventListener('message', function (data) {
            Highcharts.charts[0].update(
                hcUtils.parseOptions(data.data)
            );
        });
    </script>
  </head>
  <body>
    <div id="container"></div>
  </body>
</html>
`

export default class HighchartsReactNative extends React.PureComponent {
    constructor(props) {
        super(props);

        // extract width and height from user styles
        const userStyles = StyleSheet.flatten(this.props.styles);

        this.state = {
            width: userStyles.width || win.width,
            height: userStyles.height || win.height,
            chartOptions: this.props.options,
            useCDN: this.props.useCDN || false,
            modules: this.props.modules && this.props.modules.toString() || [],
        };

        this.initialCHartOptions = this.props.options;

        // catch rotation event
        Dimensions.addEventListener('change', () => {
            this.setState({
                width: userStyles.width || Dimensions.get('window').width,
                height: userStyles.height || Dimensions.get('window').height
            });
        });
    }

    componentDidUpdate() {
        // send options for chart.update() as string to webview
        const injectedJS = `
setTimeout(() => {
    try {
        // Highcharts.charts[0].update(hcUtils.parseOptions('${this.serialize(this.props.options, true)}'));
        ${
            this.props.options.series && this.props.options.series[0] && this.props.options.series[0].data &&
            `Highcharts.charts[0].series[0].setData([${this.props.options.series[0].data}], true, true);` ||
            `Highcharts.charts[0].update(hcUtils.parseOptions('${this.serialize(this.props.options, true)}'));`
        }
    }
    catch(err) {
        document.getElementById("container").innerHTML = err.message;
    }
}, 10);

true;
        `

        console.log(injectedJS);
        this.webView.injectJavaScript(injectedJS);
    }

    /**
     * Convert JSON to string. When is updated, functions (like events.load)
     * is not wrapped in quotes.
     */
    serialize(chartOptions, isUpdate) {
        var hcFunctions = {},
            serializedOptions,
            i = 0;

        serializedOptions = JSON.stringify(chartOptions, function (val, key) {
            var fcId = '###HighchartsFunction' + i + '###';

            // set reference to function for the later replacement
            if (typeof key === 'function') {
                hcFunctions[fcId] = key.toString();
                i++;
                return isUpdate ? key.toString() : fcId;
            }

            return key;
        });

        // replace ids with functions.
        if (!isUpdate) {
            Object.keys(hcFunctions).forEach(function (key) {
                serializedOptions = serializedOptions.replace(
                    '"' + key + '"',
                    hcFunctions[key]
                );
            });
        }

        return serializedOptions;
    }
    render() {
        const scriptsPath = this.state.useCDN ? cdnPath : path;
        const runFirst = `
    try {

           var modulesList = ${JSON.stringify(this.state.modules)};

           if (modulesList.length > 0) {
              modulesList = modulesList.split(',');
           }

           function loadScripts(file, callback, redraw, isModule) {

            // alert('loading' + file);

              var xhttp = new XMLHttpRequest();
              xhttp.onreadystatechange = function() {
                // alert(this.status + (this.statusText || '') + (this.responseText || ''));
                if (this.readyState == 4 && this.status == 200) {

                    var hcScript = document.createElement('script');
                    hcScript.innerHTML = this.responseText;
                    document.body.appendChild(hcScript);

                    if (callback) {
                        callback.call();
                    }

                    if (redraw) {
                        Highcharts.chart("container", ${this.serialize(this.initialCHartOptions)});
                    }
                }
              };
              xhttp.open("GET", '${scriptsPath}' + (isModule ? 'modules/' + file : file) + '.js', true);
              xhttp.send();
            }


            loadScripts('highcharts', function () {
                var redraw = modulesList.length > 0 ? false : true;

                loadScripts('highcharts-more', function () {
                    if (modulesList.length > 0) {
                        for (var i = 0; i < modulesList.length; i++) {
                            if (i === (modulesList.length - 1)) {
                                redraw = true;
                            } else {
                                redraw = false;
                            }
                            loadScripts(modulesList[i], undefined, redraw, true);
                        }
                    }
                }, redraw);
            }, false);
    }
    catch(err) {
        document.getElementById("container").innerHTML = err.message;
    }
        `;

        // Create container for the chart
        return <View style={[
            this.props.styles,
            { width: this.state.width, height: this.state.height }
        ]}
        >

            <WebView
                // ref = "webview"
                ref={(webView) => this.webView = webView}
                source={{ html: highchartsLayout }}
                injectedJavaScript={runFirst}
                originWhitelist={["*"]}
                automaticallyAdjustContentInsets={true}
                allowFileAccess={true}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                useWebKit={true}
                scrollEnabled={false}
                mixedContentMode='always'
            />
        </View>;
    }
}
