const Request = require('request');
var discoveryDebug = true;
var debug = false;

const request = Request.defaults({
  agent: false,
  pool: {maxSockets: 100}
})

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
    if (discoveryDebug ==true || debug == true) {log("Discover", JSON.stringify(event))};
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
                if (discoveryDebug ==true || debug == true) {log("Discover error", err)};
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
                    if (discoveryDebug ==true || debug == true) {log('Discovery', JSON.stringify(response))};

                    //context.succeed(response);
                    callback(null,response);

                // Updated for smart-home v3 skill syntax
                } else if (response.statusCode == 401) {
                    if (discoveryDebug ==true || debug == true) {log('Discovery', "Auth failure")};
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
            if (discoveryDebug ==true || debug == true) {
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