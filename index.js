var request = require('request');

exports.handler = function(event, context, callback) {
    //log("Entry", event);
    // Discovery
    if (event.directive.header.namespace === 'Alexa.Discovery') {
        //log("Entry", event.directive.payload);
        discover(event, context, callback);
    } 
    // Add options to include other directives
    else if (event.directive.header.namespace === 'Alexa.PowerController' || event.directive.header.namespace === 'Alexa.PlaybackController' || event.directive.header.namespace === 'Alexa.StepSpeaker' || event.directive.header.namespace === 'Alexa.SceneController' || event.directive.header.namespace === 'Alexa.InputController' || event.directive.header.namespace === 'Alexa.ThermostatController' || event.directive.header.namespace === 'BrightnessController' || event.directive.header.namespace === 'ColorController' || event.directive.header.namespace === 'ColorTemperatureController') {
        command(event,context, callback);
    }
    // State Reporting
    else if (event.directive.header.namespace === 'Alexa' && event.directive.header.name === 'ReportState') {
        report(event, context, callback)
    }
    else (log("Unhandled", event));
};

// Tested/ working - NOTE - Original code was a fudge, just responded positively, this does the same for now!
// Future aspiration: get device status ?via MQTT? and feedback via web service
function report(event, context, callback) {
    log("Report", event);
    var endpointId = event.directive.endpoint.endpointId;
    var messageId = event.directive.header.messageId;
    var oauth_id = event.directive.endpoint.scope.token;
    var correlationToken = event.directive.header.correlationToken;
    var payloadVersion = "3";
    var dt = new Date();
    var response = {
        context:{
        properties:[
            {
                namespace: "Alexa.EndpointHealth",
                name: "connectivity",
                value: {
                value:"OK"
                },
                timeOfSample: dt.toISOString(),
                uncertaintyInMilliseconds: 0
            }
        ]
        },
        event:{
        header:{
            messageId: messageId,
            correlationToken: correlationToken,
            namespace:"Alexa",
            name:"StateReport",
            payloadVersion: payloadVersion
        },
        endpoint:{
            scope:{
                type: "BearerToken",
                token: oauth_id
            },
            endpointId:endpointId,
            cookie:{}
        },
        payload:{}
        }
    }
    context.succeed(response);
}

// Tested/ working
function discover(event, context, callback) {
    log("Discover", JSON.stringify(event));
    if (event.directive.header.name === 'Discover') {
        var message_id = event.directive.header.messageId;
        var oauth_id = event.directive.payload.scope.token;
        //https request to the database
        request.get('https://nr-alexav3.cb-net.co.uk/api/v1/devices',{
            auth: {
                'bearer': oauth_id
            },
            timeout: 2000
        },function(err, response, body){
            //log("Discover body", body);
            // Updated for smart-home v3 skill syntax
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
                            messageId: message_id
                        },
                        payload: payload
                    }
                };
                log('Discovery', JSON.stringify(response));
                //context.succeed(response);
                callback(null,response);

            // Updated for smart-home v3 skill syntax
            } else if (response.statusCode == 401) {
                log('Discovery', "Auth failure");
                var response = {
                    event: {
                        header:{
                            namespace: "Alexa",
                            name: "ErrorResponse",
                            messageId: message_id,
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

        }).on('error', function(error){
            log('Discovery',"error: " + error);
            //other error
            //context.fail(error);
            callback(error, null);
        });
    }
}

// WIP to update to v3
function command(event, context, callback) {
    // Post directive output to console
    log('Command:', JSON.stringify(event));
    var oauth_id = event.directive.endpoint.scope.token;

    // Execute command
    request.post('https://nr-alexav3.cb-net.co.uk/api/v1/command',{
        json: event,
        auth: {
            bearer: oauth_id
        },
        timeout: 2000
    }, function(err, resp, data){
        if(err) {
            log("command error", err);
        }
        if (resp.statusCode === 200) {
            //log("Event", JSON.stringify(event));
            var endpointId = event.directive.endpoint.endpointId;
            var messageId = event.directive.header.messageId;
            var oauth_id = event.directive.endpoint.scope.token;
            var correlationToken = event.directive.header.correlationToken;
            var dt = new Date();
            var name = event.directive.header.name;
            var namespace = event.directive.header.namespace;
        
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

            // Build PlaybackController/ StepSpeaker Response Context
            if (namespace == "Alexa.PlaybackController" || namespace == "Alexa.StepSpeaker") {
                var contextResult = {
                    "properties": []
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

            // Build Brightness Controller Response Context
            if (namespace == "Alexa.BrightnessController" && (name == "AdjustBrightness" || name == "SetBrightness")) {
                if (name == "AdjustBrightness") {
                    // Return Percentage Delta (NOT in-line with spec)
                    var contextResult = {
                        "properties": [{
                            "namespace" : "Alexa.BrightnessController",
                            "name": "brightness",
                            "value": event.directive.payload.brightnessDelta,
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

            //Build Thermostat Controller - AdjustTargetTemperature/ SetTargetTemperature
            if (namespace == "Alexa.ThermostatController" && (name == "AdjustTargetTemperature" || name == "SetTargetTemperature")) {
                if (name == "AdjustTargetTemperature") {
                    if (event.directive.payload.targetSetpointDelta.value > 0) {var mode = "HEAT"};
                    if (event.directive.payload.targetSetpointDelta.value < 0) {var mode = "COOL"};
                        var targetSetPointValue = {
                        "value": event.directive.payload.targetSetpointDelta.value,
                        "scale": event.directive.payload.targetSetpointDelta.scale
                    };
                }
                else if (name == "SetTargetTemperature") {
                    // if (event.directive.payload.targetSetpoint.value > 0) {var mode = "HEAT"};
                    // if (event.directive.payload.targetSetpoint.value > 0) {var mode = "COOL"};
                    var mode = "HEAT"
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

            log("Response", JSON.stringify(response));

            //context.succeed(response);
            callback(null, response);

        } else if (resp.statusCode === 401) {
            log('command', "Auth failure");
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
                    type: "NOT_IN_OPERATION",
                    message: "Target endpoint unavailable."
                }
            }
        };
        log("Command",JSON.stringify(response));
        //context.fail(response);
        callback(error,null);
    });
}

function log(title, msg) {
    console.log('*************** ' + title + ' *************');
    console.log(msg);
    console.log('*************** ' + title + ' End*************');
}