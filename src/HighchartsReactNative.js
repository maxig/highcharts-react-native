import React from 'react';
import {
    Text,
    View,
    Dimensions,
    StyleSheet
} from 'react-native';
import { WebView } from 'react-native-webview';

const win = Dimensions.get('window');
const path = '../highcharts-files/';
const highchartsLayout = require('../highcharts-layout/index.html');

export default class HighchartsReactNative extends React.PureComponent {
    constructor(props) {
        super(props);

        // extract width and height from user styles
        const userStyles = StyleSheet.flatten(this.props.styles);

        this.state = {
            width: userStyles.width || win.width,
            height: userStyles.height || win.height,
            chartOptions: this.props.options
        };

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
            try {
                Highcharts.charts[0].update(hcUtils.parseOptions('${this.serialize(this.props.options, true)}'));
            }
            catch(err) {
                document.getElementById("container").innerHTML = err.message;
            }

            true
        `

        this._webViewRef.injectJavaScript(injectedJS);
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
        const runFirst = `

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

           function loadDoc() {

              var xhttp = new XMLHttpRequest();
              xhttp.onreadystatechange = function() {
                if (this.readyState == 4 && this.status == 200) {

                    var hcScript = document.createElement('script');
                    hcScript.innerHTML = this.responseText;
                    document.body.appendChild(hcScript);

                    Highcharts.chart("container", ${this.serialize(this.props.options)});
                }
              };
              xhttp.open("GET", "${path}highcharts.js", true);
              xhttp.send();
            }

            loadDoc();
        `;

        // Create container for the chart
        return <View style={[
            this.props.styles,
            { width: this.state.width, height: this.state.height }
        ]}
        >

            <WebView
                ref={(ref) => { this._webViewRef = ref; }}
                source={highchartsLayout}
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
