var request = require('request');
var debug = false;

exports.handler = function(event, context, callback) {
    // Authorization   
    if (event.directive.header.namespace === "Alexa.Authorization") {
        //log("Entry", event.directive.payload);
        auth(event, context, callback);
    }
    // Discover
    else if (event.directive.header.namespace === 'Alexa.Discovery') {
        //log("Entry", event.directive.payload);
        discover(event, context, callback);
    } 
    // Command w/ device-specific directives
    else if (event.directive.header.namespace === 'Alexa.BrightnessController' 
    || (event.directive.header.namespace === 'Alexa.ChannelController' && event.directive.header.name !== 'SkipChannels')
    || event.directive.header.namespace === 'Alexa.ColorController' 
    || event.directive.header.namespace === 'Alexa.ColorTemperatureController'
    || event.directive.header.namespace === 'Alexa.InputController' 
    || event.directive.header.namespace === 'Alexa.LockController'
    || event.directive.header.namespace === 'Alexa.PercentageController'
    || event.directive.header.namespace === 'Alexa.PlaybackController'
    || event.directive.header.namespace === 'Alexa.PowerController'
    || event.directive.header.namespace === 'Alexa.RangeController'
    || event.directive.header.namespace === 'Alexa.SceneController' 
    || event.directive.header.namespace === 'Alexa.Speaker' 
    || event.directive.header.namespace === 'Alexa.StepSpeaker'     
    || event.directive.header.namespace === 'Alexa.ThermostatController') {

        command(event, context, callback);
    }
    // State Reporting
    else if (event.directive.header.namespace === 'Alexa' && event.directive.header.name === 'ReportState') {
        report(event, context, callback)
    }
    else {
        if (debug == true) {log("Unhandled", event)};
        var oauth_id = event.directive.endpoint.scope.token;
        var endpointId = event.directive.endpoint.endpointId;
        var messageId = event.directive.header.messageId;
        var correlationToken = event.directive.header.correlationToken;
        var response = {
            event: {
                header:{
                    namespace: "Alexa",
                    name: "ErrorResponse",
                    messageId: messageId,
                    correlationToken: correlationToken,
                    payloadVersion: "3"
                },
                endpoint: {
                    scope: {
                        type: "BearerToken",
                        BearerToken: oauth_id
                    },
                    endpointId : endpointId,
                },
                payload:{
                    type: "INVALID_DIRECTIVE",
                    message: "Command or directive not supported by this endpoint"
                }
            }
        };
        //context.failed(response);
        callback(null, response);
    }
};

// Report State Function
function report(event, context, callback) {
    // Modify existing "report" Lambda function to use /api/v1/getstate WebAPI endpoint
    if (debug == true) {log("ReportState", JSON.stringify(event))};
    var oauth_id = event.directive.endpoint.scope.token;
    var endpointId = event.directive.endpoint.endpointId;
    var messageId = event.directive.header.messageId;
    var correlationToken = event.directive.header.correlationToken;
    // https request to the WebAPI to get deviceState
    request.get("https://" + process.env.WEB_API_HOSTNAME + "/api/v1/getstate/"+ endpointId,{
        auth: {
            'bearer': oauth_id
        },
        timeout: 2000
    },function(err, response, body){
        if(err) {
            if (debug == true) {log("report error", err)};
        }
        if (response.statusCode == 200) {
            var properties = JSON.parse(body);
            if (debug == true) {log('ReportState', JSON.stringify(response))};
            if (debug == true) {log('ReportState', JSON.stringify(properties))};
            // Build RequestState Response
            var response = {};
            response.event = {
                "header":{  
                    "messageId":messageId,
                    "correlationToken":correlationToken,
                    "namespace":"Alexa",
                    "name":"StateReport",
                    "payloadVersion":"3"
                },
                "endpoint":{
                    "scope": {
                        "type": "BearerToken",
                        "token": oauth_id
                    },
                "endpointId":endpointId,
                "cookie": {}
                }
            }    
            response.context = {};
            response.context.properties = properties;
            response.payload = {};       
            
            if (debug == true) {log('ReportState Response', JSON.stringify(response))};

            callback(null,response);
        }
        else if (response.statusCode == 429) {
            var response = {
                "event": {
                    "header": {
                      "namespace": "Alexa",
                      "name": "ErrorResponse",
                      "messageId": messageId,
                      "correlationToken": correlationToken,
                      "payloadVersion": "3"
                    },
                    "endpoint":{
                        "endpointId": endpointId
                    },
                    "payload": {
                      "type": "RATE_LIMIT_EXCEEDED",
                      "message": "Unable to reach endpoint because Node-RED Bridge appears to be offline"
                    }
                  }
                }
            if (debug == true) {log('ReportState throttled, response:', JSON.stringify(response))};
            callback(null, response);
        }
    }).on('error', function(error){
            if (debug == true) {
                log('ReportState',"error: " + error)
                var response = {
                    "event": {
                        "header": {
                          "namespace": "Alexa",
                          "name": "ErrorResponse",
                          "messageId": messageId,
                          "correlationToken": correlationToken,
                          "payloadVersion": "3"
                        },
                        "endpoint":{
                            "endpointId": endpointId
                        },
                        "payload": {
                          "type": "BRIDGE_UNREACHABLE",
                          "message": "Unable to reach endpoint because Node-RED Bridge appears to be offline"
                        }
                      }
                    }
            };
            //other error
            //context.fail(error);
            callback(error, response);
        });
}

// Authorization Function
function auth(event, context, callback) {
    if (debug == true) {log("Authorization", JSON.stringify(event))};
    if (event.directive.header.name === 'AcceptGrant') {
        var oauth_id = event.directive.payload.grantee.token;
        var messageId = event.directive.header.messageId;
        //https request to the WebAPI
        request.post("https://" + process.env.WEB_API_HOSTNAME + "/api/v1/authorization",{
            auth: {
                'bearer': oauth_id
            },
            json: event,
            timeout: 2000
        },function(err, response, body){
            if(err) {
                if (debug == true) {log("Authorization", "error", err)};
            }
            else {
                if (response.statusCode == 200) {
                    //context.succeed(response);
                    callback(null,body);
                }
                else {
                    var failure = {
                        event: {
                            header: {
                                messageId: messageId,
                                namespace: "Alexa.Authorization",
                                name: "ErrorResponse",
                                payloadVersion: "3"
                            },
                            payload: {
                                type: "ACCEPT_GRANT_FAILED",
                                message: "Failed to handle the AcceptGrant directive"
                            }
                        }
                    };
                    //context.failed(failure);
                    callback(null,failure);
                }
            }
        }).on('error', function(error){
            if (debug == true) {
                log('Authorization',"error: " + error)
            };
            var failure = {
                event: {
                    header: {
                        messageId: messageId,
                        namespace: "Alexa.Authorization",
                        name: "ErrorResponse",
                        payloadVersion: "3"
                    },
                    payload: {
                        type: "ACCEPT_GRANT_FAILED",
                        message: "Failed to handle the AcceptGrant directive"
                    }
                }
            };
            //other error
            //context.fail(error);
            callback(error, failure);
        });
    }
};

// Discover Function
function discover(event, context, callback) {
    if (debug == true) {log("Discover", JSON.stringify(event))};
    if (event.directive.header.name === 'Discover') {
        var oauth_id = event.directive.payload.scope.token;
        var correlationToken = event.directive.header.correlationToken;
        var messageId = event.directive.header.messageId;
        //https request to the WebAPI
        request.get("https://" + process.env.WEB_API_HOSTNAME + "/api/v1/devices",{
            auth: {
                'bearer': oauth_id
            },
            timeout: 2000
        },function(err, response, body){
            //log("Discover body", body);
            // Updated for smart-home v3 skill syntax
            if(err) {
                if (debug == true) {log("Discover error", err)};
            }
            if(!err) {
            //////////////////////////////
                if (response.statusCode == 200) {
                    var payload = {
                        endpoints: JSON.parse(body)
                    };
                    var response = {
                        event:{
                            header:{
                                namespace: "Alexa.Discovery",
                                name: "Discover.Response",
                                payloadVersion: "3",
                                messageId: messageId
                            },
                            payload: payload
                        }
                    };
                    if (debug == true) {log('Discovery', JSON.stringify(response))};

                    //context.succeed(response);
                    callback(null,response);

                // Updated for smart-home v3 skill syntax
                } else if (response.statusCode == 401) {
                    if (debug == true) {log('Discovery', "Auth failure")};
                    var response = {
                        event: {
                            header:{
                                namespace: "Alexa",
                                name: "ErrorResponse",
                                messageId: messageId,
                                payloadVersion: "3"
                            },
                            payload:{
                                type: "INVALID_AUTHORIZATION_CREDENTIAL",
                                message: "Authentication failure."
                            }
                        }
                    };
                    //context.succeed(response);
                    callback(null,response);
                }
            //////////////////////////////
            }

        }).on('error', function(error){
            if (debug == true) {
                log('Discovery',"error: " + error)
            };
            var response = { 
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        payloadVersion: "3"
                    },
                    payload:{
                        type: "ENDPOINT_UNREACHABLE",
                        message: "Target endpoint unavailable."
                    }
                }
            };
            //other error
            //context.fail(error);
            callback(error, response);
        });
    }
}

// Command Function
function command(event, context, callback) {
    if (debug == true) {log('Command:', JSON.stringify(event))};
    var oauth_id = event.directive.endpoint.scope.token;
    //log("Event", JSON.stringify(event));
    var endpointId = event.directive.endpoint.endpointId;
    var messageId = event.directive.header.messageId;
    var oauth_id = event.directive.endpoint.scope.token;
    var correlationToken = event.directive.header.correlationToken;

    // Execute command
    request.post("https://" + process.env.WEB_API_HOSTNAME + "/api/v1/command2",{
        json: event,
        auth: {
            bearer: oauth_id
        },
        timeout: 2000
    }, function(err, resp, data){
        if(err) {
            if (debug == true) {log("command error", err)};
            var response = {
                "event": {
                    "header": {
                      "namespace": "Alexa",
                      "name": "ErrorResponse",
                      "messageId": messageId,
                      "correlationToken": correlationToken,
                      "payloadVersion": "3"
                    },
                    "endpoint":{
                        "endpointId": endpointId
                    },
                    "payload": {
                      "type": "BRIDGE_UNREACHABLE",
                      "message": "Unable to reach endpoint because Node-RED Bridge appears to be offline"
                    }
                  }
                }
            callback(err, response);
        }

        if (!err) {
        ///////////////////////////////////////////////////
            var dt = new Date();
            var name = event.directive.header.name;
            var namespace = event.directive.header.namespace;

            if (resp.statusCode === 200) { 
                if (debug == true) {log("Response", JSON.stringify(data))};

                //context.succeed(response);
                callback(null, data);
            }
            else if (resp.statusCode === 401) {
                if (debug == true) {log('command', "Auth failure")};
                var response = {
                    event: {
                        header:{
                            namespace: "Alexa",
                            name: "ErrorResponse",
                            messageId: messageId,
                            payloadVersion: "3"
                        },
                        payload:{
                            type: "INVALID_AUTHORIZATION_CREDENTIAL",
                            message: "Authentication failure."
                        }
                    }
                };
                //context.succeed(response);
                callback(null, response);
            }
            // No Such Endpoint Response
            else if (resp.statusCode === 404) {
                if (debug == true) {log('command', "No such device or endpoint!")};
                var response = {
                    event: {
                        header:{
                            namespace: "Alexa",
                            name: "ErrorResponse",
                            messageId: messageId,
                            correlationToken: correlationToken,
                            payloadVersion: "3"
                        },
                        endpoint: {
                            scope: {
                                type: "BearerToken",
                                BearerToken: oauth_id
                                },
                            endpointId : endpointId,
                        },
                        payload:{
                            type: "NO_SUCH_ENDPOINT	",
                            message: "No such device or endpoint!"
                        }
                    }
                };
                //context.succeed(response);
                callback(null, response);
            }
            // TEMPERATURE_VALUE_OUT_OF_RANGE Response
            else if (resp.statusCode === 416) {
                if (debug == true) {log('command', "TEMPERATURE_VALUE_OUT_OF_RANGE Failure")};
                var response = {
                    event: {
                        header:{
                            namespace: "Alexa",
                            name: "ErrorResponse",
                            messageId: messageId,
                            correlationToken: correlationToken,
                            payloadVersion: "3"
                        },
                        endpoint: {
                            scope: {
                                type: "BearerToken",
                                BearerToken: oauth_id
                            },
                            endpointId : endpointId,
                        },
                        payload:{
                            type: "TEMPERATURE_VALUE_OUT_OF_RANGE",
                            message: "The requested temperature is out of range."
                        }
                    }
                };
                //context.succeed(response);
                callback(null, response);
            }
            // VALUE_OUT_OF_RANGE Response
            else if (resp.statusCode === 417) {
                if (debug == true) {log('command', "VALUE_OUT_OF_RANGE Failure")};
                var response = {
                    event: {
                        header:{
                            namespace: "Alexa",
                            name: "ErrorResponse",
                            messageId: messageId,
                            correlationToken: correlationToken,
                            payloadVersion: "3"
                        },
                        endpoint: {
                            scope: {
                                type: "BearerToken",
                                BearerToken: oauth_id
                            },
                            endpointId : endpointId,
                        },
                        payload:{
                            type: "VALUE_OUT_OF_RANGE",
                            message: "The requested value is out of range."
                        }
                    }
                };
                //context.succeed(response);
                callback(null, response);
            }
        ///////////////////////////////////////////////////
        }

    }).on('error', function(error){
        var response = { 
            event: {
                header:{
                    namespace: "Alexa",
                    name: "ErrorResponse",
                    messageId: messageId,
                    payloadVersion: "3"
                },
                payload:{
                    type: "ENDPOINT_UNREACHABLE",
                    message: "Target endpoint unavailable."
                }
            }
        };
        if (debug == true) {log("Command",JSON.stringify(response))};
        //context.fail(response);
        callback(error,null);
    });
}

function log(title, msg) {
    console.log('*************** ' + title + ' *************');
    console.log(msg);
    console.log('*************** ' + title + ' End*************');
}

/* 

///////////////////////////////////////// Legacy Command Function /Logic
This code sits below definition of supported interfaces

        // //Pre-evaluation checks - any directives where you want to compare existing state data should be called out here, i.e thermostatSetpoint
        // var evalData;
        // var namespace = event.directive.header.namespace;
        // if (namespace === 'Alexa.ThermostatController' || namespace === 'Alexa.PercentageController' || namespace === 'Alexa.Speaker') {
        //     // //Use getstat API extract current relevant endpoint state value
        //     var endpointId = event.directive.endpoint.endpointId;
        //     var oauth_id = event.directive.endpoint.scope.token;
        //     request.get("https://" + process.env.WEB_API_HOSTNAME +"/api/v1/getstate/"+ endpointId,{
        //         auth: {
        //             'bearer': oauth_id
        //         },
        //         timeout: 2000
        //     },function(error, response, data){
        //         if (response.statusCode == 200) {
        //             var properties = JSON.parse(data);
        //             // //Assess getstat API reposne for endpoint and extract current value
        //             properties.forEach(function(element){
        //                 if (element.name === "targetSetpoint" && namespace === 'Alexa.ThermostatController' ) {evalData = element.value};
        //                 if (element.name === "percentage" && namespace === 'Alexa.PercentageController') {evalData = element.value};
        //                 if (element.name === "volume" && namespace === 'Alexa.Speaker') {evalData = element.value};
        //             });
        //             // //Pass current value as evalData to command function
        //             if (debug == true && evalData) {log("Command evalData:" + JSON.stringify(evalData))};
        //             command(event, evalData, context, callback);    
        //         }
        //         else {
        //             // //Request evalData failed, targetSetPoint will be empty
        //             if (debug == true) {log("Command evalData retrieval FAILED with response code:" + response.statusCode)};
        //             command(event, evalData, context, callback);
        //         }                       
        //     }).on('error', function(error){
        //             // //Request evalData failed, targetSetPoint will be empty
        //             if (debug == true) {log("Command evalData retrieval FAILED")};
        //             command(event, evalData, context, callback);
        //     });
        // }
        
        // // No pre-eval check required (you don't need to compare values to send correcty command response)
       // else {command(event, evalData, context, callback);}

//////////////////////////////////////////

// Command Function
function command(event, evalData, context, callback) {
    // Post directive output to console
    if (debug == true) {log('Command:', JSON.stringify(event))};
    var oauth_id = event.directive.endpoint.scope.token;

    // Execute command
    request.post("https://" + process.env.WEB_API_HOSTNAME + "/api/v1/command",{
        json: event,
        auth: {
            bearer: oauth_id
        },
        timeout: 2000
    }, function(err, resp, data){
        if(err) {
            if (debug == true) {log("command error", err)};
        }

        //log("Event", JSON.stringify(event));
        var endpointId = event.directive.endpoint.endpointId;
        var messageId = event.directive.header.messageId;
        var oauth_id = event.directive.endpoint.scope.token;
        var correlationToken = event.directive.header.correlationToken;
        var dt = new Date();
        var name = event.directive.header.name;
        var namespace = event.directive.header.namespace;

        if (resp.statusCode === 200) {
    
            // Build Header
            var header = {
                "namespace": "Alexa",
                "name": "Response",
                "payloadVersion": "3",
                "messageId": messageId + "-R",
                "correlationToken": correlationToken
            }

            // Build Default Endpoint Response
            var endpoint = {
                "scope": {
                    "type": "BearerToken",
                    "token": oauth_id
                },
                "endpointId": endpointId
            }
        
            // Build Brightness Controller Response Context
            if (namespace == "Alexa.BrightnessController" && (name == "AdjustBrightness" || name == "SetBrightness")) {
                if (name == "AdjustBrightness") {
                    var brightness;
                    if (event.directive.payload.brightnessDelta < 0) {
                        brightness = event.directive.payload.brightnessDelta + 100;
                    }
                    else {
                        brightness = event.directive.payload.brightnessDelta;
                    }
                    // Return Percentage Delta (NOT in-line with spec)
                    var contextResult = {
                        "properties": [{
                            "namespace" : "Alexa.BrightnessController",
                            "name": "brightness",
                            "value": brightness,
                            "timeOfSample": dt.toISOString(),
                            "uncertaintyInMilliseconds": 50
                        }]
                    };

                }
                if (name == "SetBrightness") {
                    // Return Percentage
                    var contextResult = {
                        "properties": [{
                            "namespace" : "Alexa.BrightnessController",
                            "name": "brightness",
                            "value": event.directive.payload.brightness,
                            "timeOfSample": dt.toISOString(),
                            "uncertaintyInMilliseconds": 50
                        }]
                    }                
                };

            }

            // Build Channel Controller Response Context
            if (namespace == "Alexa.ChannelController") {
                if (name == "ChangeChannel") { 
                    if (event.directive.payload.channel.hasOwnProperty('number')) {
                    var contextResult = {
                    "properties": [
                        {
                          "namespace": "Alexa.ChannelController",
                          "name": "channel",
                          "value": {
                            "number": event.directive.payload.channel.number
                          },
                          "timeOfSample": dt.toISOString(),
                          "uncertaintyInMilliseconds": 50
                        }
                      ]}
                    }
                    else if (event.directive.payload.channel.hasOwnProperty('callSign')) {
                        var contextResult = {
                            "properties": [
                                {
                                "namespace": "Alexa.ChannelController",
                                "name": "channel",
                                "value": {
                                    "callSign": event.directive.payload.channel.callSign                                
                                },
                                "timeOfSample": dt.toISOString(),
                                "uncertaintyInMilliseconds": 50
                                }
                            ]}
                    }
                }
            }

            // ColorController
            if (namespace == "Alexa.ColorController") {
                var contextResult = {
                    "properties": [{
                        "namespace" : "Alexa.ColorController",
                        "name": "color",
                        "value": {
                            "hue": event.directive.payload.color.hue,
                            "saturation": event.directive.payload.color.saturation,
                            "brightness": event.directive.payload.color.brightness
                        },
                        "timeOfSample": dt.toISOString(),
                        "uncertaintyInMilliseconds": 50
                    }]
                };
            }

            // Build ColorTemperatureController Response Context
            if (namespace == "Alexa.ColorTemperatureController") {
                var strPayload = event.directive.payload.colorTemperatureInKelvin;
                var colorTemp;
                if (typeof strPayload != 'number') {
                    if (strPayload == "warm" || strPayload == "warm white") {colorTemp = 2200};
                    if (strPayload == "incandescent" || strPayload == "soft white") {colorTemp = 2700};
                    if (strPayload == "white") {colorTemp = 4000};
                    if (strPayload == "daylight" || strPayload == "daylight white") {colorTemp = 5500};
                    if (strPayload == "cool" || strPayload == "cool white") {colorTemp = 7000};
                }
                else {
                    colorTemp = event.directive.payload.colorTemperatureInKelvin;
                }
                var contextResult = {
                    "properties": [{
                        "namespace" : "Alexa.ColorTemperatureController",
                        "name": "colorTemperatureInKelvin",
                        "value": colorTemp,
                        "timeOfSample": dt.toISOString(),
                        "uncertaintyInMilliseconds": 50
                    }]
                }
            }

            // Build Input Controller Response Context
            if (namespace == "Alexa.InputController") {
                var contextResult = {
                    "properties": [{
                        "namespace" : "Alexa.InputController",
                        "name": "input",
                        "value": event.directive.payload.input,
                        "timeOfSample": dt.toISOString(),
                        "uncertaintyInMilliseconds": 50
                    }]
                }
                endpoint = {
                    "endpointId": endpointId
                }
            }

            // Build Lock Controller Response Context - SetThermostatMode
            if (namespace == "Alexa.LockController") {
                var lockState;
                if (name == "Lock") {lockState = "LOCKED"};
                if (name == "Unlock") {lockState = "UNLOCKED"};
                var contextResult = {
                    "properties": [{
                    "namespace": "Alexa.LockController",
                    "name": "lockState",
                    "value": lockState,
                    "timeOfSample": dt.toISOString(),
                    "uncertaintyInMilliseconds": 500
                    }]
                };
            }

            // Build PercentageController Response Context
            if (namespace == "Alexa.PercentageController") {
                if (name == "SetPercentage") {
                    var contextResult = {
                        "properties": [{
                            "namespace": "Alexa.PercentageController",
                            "name": "percentage",
                            "value": event.directive.payload.percentage,
                            "timeOfSample": dt.toISOString(),
                            "uncertaintyInMilliseconds": 500
                        }]
                    };
                }
                if (name == "AdjustPercentage") {
                    var percentage;
                    if (evalData) {
                        if (evalData + event.directive.payload.percentageDelta > 100) {percentage = 100}
                        else if (evalData - event.directive.payload.percentageDelta < 0) {percentage = 0}
                        else {percentage = evalData + event.directive.payload.percentageDelta}
                        var contextResult = {
                            "properties": [{
                                "namespace": "Alexa.PercentageController",
                                "name": "percentage",
                                "value": percentage,
                                "timeOfSample": dt.toISOString(),
                                "uncertaintyInMilliseconds": 500
                                }]
                            };
                        }
                }
            }

            // Build PlaybackController Response Context
            if (namespace == "Alexa.PlaybackController") {
                var contextResult = {
                    "properties": []
                };
            }

            // Build PowerController Response Context
            if (namespace == "Alexa.PowerController") {
                if (name == "TurnOn") {var newState = "ON"};
                if (name == "TurnOff") {var newState = "OFF"};
                var contextResult = {
                    "properties": [{
                        "namespace": "Alexa.PowerController",
                        "name": "powerState",
                        "value": newState,
                        "timeOfSample": dt.toISOString(),
                        "uncertaintyInMilliseconds": 50
                    }]
                };
            }

            // Build Scene Controller Activation Started Event
            if (namespace == "Alexa.SceneController") {
                header.namespace = "Alexa.SceneController";
                header.name = "ActivationStarted";
                var contextResult = {};
                var payload = {
                        "cause" : {
                            "type" : "VOICE_INTERACTION"
                            },
                        "timestamp": dt.toISOString()
                        };
            }

            // Build Speaker Response Context
            if (namespace == "Alexa.Speaker") {
                if (name == "SetVolume") {
                    var contextResult = {
                        "properties": [
                            {
                            "namespace": "Alexa.Speaker",
                            "name": "volume",
                            "value":  event.directive.payload.volume,
                            "timeOfSample": dt.toISOString(),
                            "uncertaintyInMilliseconds": 50
                            }
                        ]}
                    }
                else if (name == "SetMute") {
                    var contextResult = {
                        "properties": [
                            {
                                "namespace": "Alexa.Speaker",
                                "name": "muted",
                                "value": event.directive.payload.mute,
                                "timeOfSample": dt.toISOString(),
                                "uncertaintyInMilliseconds": 50
                            }
                        ]}
                }
                else {
                    var contextResult = {
                        "properties": []
                    };
                }
            }

            // Build StepSpeaker Response Context
            if (namespace == "Alexa.StepSpeaker") {
                var contextResult = {
                    "properties": []
                    };
            }
           
            //Build Thermostat Controller Response Context - AdjustTargetTemperature/ SetTargetTemperature
            if (namespace == "Alexa.ThermostatController" 
                && (name == "AdjustTargetTemperature" || name == "SetTargetTemperature" || name == "SetThermostatMode")) {
                if (name == "AdjustTargetTemperature") {
                    var newTemp;
                    var scale;
                    if (evalData){
                        if (debug == true) {log("AdjustTargetTemperature provided evalData:" + JSON.stringify(evalData))};
                        if (evalData.hasOwnProperty('value') && evalData.hasOwnProperty('scale')) {
                            newTemp = evalData.value + event.directive.payload.targetSetpointDelta.value;
                            scale = evalData.scale;
                        }
                    }
                    else {
                        newTemp = event.directive.payload.targetSetpointDelta.value;
                        scale = event.directive.payload.targetSetpointDelta.scale;
                    }
                    if (event.directive.payload.targetSetpointDelta.value > 0) {var mode = "HEAT"};
                    if (event.directive.payload.targetSetpointDelta.value < 0) {var mode = "COOL"};
                    var targetSetPointValue = {
                        "value": newTemp,
                        "scale": scale
                    };
                }
                else if (name == "SetTargetTemperature") {
                    if (evalData){
                        if (debug == true) {log("SetTargetTemperature provided evalData:" + JSON.stringify(evalData))};
                        if (event.directive.payload.targetSetpoint.value > evalData.value) {var mode = "HEAT"}
                        else if (event.directive.payload.targetSetpoint.value < evalData.value) {var mode = "COOL"}
                        else {var mode = "HEAT"} // Fallback
                    }
                    else {var mode = "HEAT"}
                    var targetSetPointValue = {
                        "value": event.directive.payload.targetSetpoint.value,
                        "scale": event.directive.payload.targetSetpoint.scale
                    };
                }
                var contextResult = {
                    "properties": [{
                        "namespace": "Alexa.ThermostatController",
                        "name": "targetSetpoint",
                        "value": targetSetPointValue,
                        "timeOfSample": dt.toISOString(),
                        "uncertaintyInMilliseconds": 50
                    },
                    {
                        "namespace": "Alexa.ThermostatController",
                        "name": "thermostatMode",
                        "value": mode,
                        "timeOfSample": dt.toISOString(),
                        "uncertaintyInMilliseconds": 50
                    },
                    {
                        "namespace": "Alexa.EndpointHealth",
                        "name": "connectivity",
                        "value": {
                            "value": "OK"
                        },
                        "timeOfSample": dt.toISOString(),
                        "uncertaintyInMilliseconds": 50
                    }]
                };
            }
            
            // Build Thermostat Controller Response Context - SetThermostatMode
            if (namespace == "Alexa.ThermostatController" && name == "SetThermostatMode") {
                var contextResult = {
                    "properties": [{
                    "namespace": "Alexa.ThermostatController",
                    "name": "thermostatMode",
                    "value": event.directive.payload.thermostatMode.value,
                    "timeOfSample": dt.toISOString(),
                    "uncertaintyInMilliseconds": 500
                }]
                };
            }

            // Default Response Format (payload is empty)
            if (namespace != "Alexa.SceneController"){
                // Compile Final Response Message
                var response = {
                    context: contextResult,
                    event: {
                    header: header,
                    endpoint: endpoint,
                    payload: {}
                    }
                };
            }

            // SceneController Specific Event
            else {
                var response = {
                    context: contextResult,
                    event: {
                    header: header,
                    endpoint: endpoint,
                    payload: payload
                    }
                };                
            }

            if (debug == true) {log("Response", JSON.stringify(response))};

            //context.succeed(response);
            callback(null, response);

        } else if (resp.statusCode === 401) {
            if (debug == true) {log('command', "Auth failure")};
            var response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        payloadVersion: "3"
                    },
                    payload:{
                        type: "INVALID_AUTHORIZATION_CREDENTIAL",
                        message: "Authentication failure."
                    }
                }
            };
            //context.succeed(response);
            callback(null, response);
        }
        // No Such Endpoint Response
        else if (resp.statusCode === 404) {
            if (debug == true) {log('command', "No such device or endpoint!")};
            var response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        correlationToken: correlationToken,
                        payloadVersion: "3"
                    },
                    endpoint: {
                        scope: {
                            type: "BearerToken",
                            BearerToken: oauth_id
                            },
                        endpointId : endpointId,
                    },
                    payload:{
                        type: "NO_SUCH_ENDPOINT	",
                        message: "No such device or endpoint!"
                    }
                }
            };
            //context.succeed(response);
            callback(null, response);
        }
        // TEMPERATURE_VALUE_OUT_OF_RANGE Response
        else if (resp.statusCode === 416) {
            if (debug == true) {log('command', "TEMPERATURE_VALUE_OUT_OF_RANGE Failure")};
            var response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        correlationToken: correlationToken,
                        payloadVersion: "3"
                    },
                    endpoint: {
                        scope: {
                            type: "BearerToken",
                            BearerToken: oauth_id
                        },
                        endpointId : endpointId,
                    },
                    payload:{
                        type: "TEMPERATURE_VALUE_OUT_OF_RANGE",
                        message: "The requested temperature is out of range."
                    }
                }
            };
            //context.succeed(response);
            callback(null, response);
        }
        // VALUE_OUT_OF_RANGE Response
        else if (resp.statusCode === 417) {
            if (debug == true) {log('command', "VALUE_OUT_OF_RANGE Failure")};
            var response = {
                event: {
                    header:{
                        namespace: "Alexa",
                        name: "ErrorResponse",
                        messageId: messageId,
                        correlationToken: correlationToken,
                        payloadVersion: "3"
                    },
                    endpoint: {
                        scope: {
                            type: "BearerToken",
                            BearerToken: oauth_id
                        },
                        endpointId : endpointId,
                    },
                    payload:{
                        type: "VALUE_OUT_OF_RANGE",
                        message: "The requested value is out of range."
                    }
                }
            };
            //context.succeed(response);
            callback(null, response);
        }
    }).on('error', function(){
        var response = { 
            event: {
                header:{
                    namespace: "Alexa",
                    name: "ErrorResponse",
                    messageId: messageId,
                    payloadVersion: "3"
                },
                payload:{
                    type: "ENDPOINT_UNREACHABLE",
                    message: "Target endpoint unavailable."
                }
            }
        };
        if (debug == true) {log("Command",JSON.stringify(response))};
        //context.fail(response);
        callback(error,null);
    });
}
 */