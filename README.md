# Node Red Alexa Home Skill v3
An Alexa Smart Home API v3 Skill for use with Node Red - enables the following Alexa native skills:
* Speaker (Step at time of writing)
* Playback Control (Play, Pause, Stop)
* Power Control (On/ Off)

Note there are 3 component parts to this service:
* A [Web Application/ Associated Databases, Authentication and MQTT services](https://github.com/coldfire84/node-red-alexa-home-skill-v3-web)
* The Amazon Lambda function
* A Node-Red contrib (github repo link to follow for this fork)

At present *you* must deploy these component parts and update as outlined below. I'm working on hosting this in AWS shortly!

To re-use this function find and replace all instances of "nr-alexav3.cb-net.co.uk" with your [web service](https://github.com/coldfire84/node-red-alexa-home-skill-v3-web) deployment.

Please see full [README.md](https://github.com/coldfire84/node-red-alexa-home-skill-v3-web/blob/master/README.md) for the combined service.