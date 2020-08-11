require('nodejs-import-helper');
const fileUtils = require('fs')
var path = require("path");
const DependencyHelper = include('src/org/metajs/core/DependencyHelper.js')
const LinksStartWebpackLoaderCommon = require('./LinksStartWebpackLoaderCommon.js');
const cheerio = require('cheerio')

function EntrypointModuleCreator() {

  var _this = this;

  var entrypointTemplatePath = path.resolve(__filename,'..')+'/LinkstartTemplate.js';
  var entrypointTemplate = fileUtils.readFileSync(entrypointTemplatePath, 'utf8');

  var requireTemplate = `const @dependencyClassName = require('@dependencyLocation');`;
  var instantiateModuleTemplate = `_this.context["@dependencyName"] = new @dependencyClassName();`;
  var injectionTemplate = `_this.context["@dependencyName"].@autowireName = _this.context["@autowireName"];`;
  var fragmentMappingTemplate = `_this.actionsByFragmentUrlRoute["@route"] = _this.context["@dependencyName"];`;

  var flashBootApplicationTemplate = `

  import './styles/index.scss'

  function LinkStartApplication() {

    var _this = this;
    _this.context = {};
    _this.actionsByFragmentUrlRoute = {};

  }

  `;
  var linkStartFunctionTemplate = `

  function linkStart(){
    let linkStartApplication = new LinkStartApplication();
    linkStartApplication.start();
  }

  `;

  var startFunctionTemplate = `
  _this.start = function () {
    @require
    @instantiate
    @injection
    @fragmentListeners

    if(_this.defaultFragmentUrlRoute && _this.actionsByFragmentUrlRoute[_this.defaultFragmentUrlRoute]){
      console.log("default route detected: "+_this.defaultFragmentUrlRoute);
      _this.route(_this.defaultFragmentUrlRoute);
    }else{
      console.log('There are not any @Action defined as entrypoint');
    }
  };

  _this.applyActionBinding = function (action) {
    console.log("applyActionBinding is starting");
    let page = action[action.ls_render];
    let actionListeners = action.ls_actionListeners;
    let elements = page.getElements();
    console.log(elements);

    if (typeof page === 'undefined') {
      console.log("defaultPage for this action is undefined");
      return;
    }

    if (typeof actionListeners === 'undefined' || actionListeners.length == 0) {
      return;
    }
    Object.keys(actionListeners).forEach(function(key,index) {
      elements.forEach(function(element) {
        //if exist as model
        if(actionListeners[key].tagId === element.tagId){
          //if has ls id
          if(typeof element.lsId !== 'undefined'){
            //if exist as action function
            if (typeof action[key] !== "undefined" && typeof action[key] === "function") {
              let functionInstance = action[key];
              let typeFunction = actionListeners[key].typeFunction;
              let domElement = _this.getElementByLsId(element.lsId);
              if(typeof domElement !== 'undefined'){
                if(typeFunction === "onclick"){
                  domElement.onclick = functionInstance;
                }else{
                  console.log("type action not implemented yet: "+typeFunction);
                }
              }else{
                console.log("element was not found in dom. tagId="+element.tagId+" lsId="+element.lsId);
              }
            }else{
              console.log(key +" is undefined or is not a function in @Action");
            }
          }else{
            console.log(key+" does not have ls-id");
          }
        }else{
          console.log(element.tagId + " is not registered as @actionListener");
        }
      });

    });
  };

  _this.applyDomBinding = function (action) {
    console.log("applyDomBinding is starting");
    let domElementsToSearch = action.ls_domElements;
    let page = action[action.ls_render];
    let elements = page.getElements();

    Object.keys(domElementsToSearch).forEach(function(key,index) {
      let tagIdToSearch = domElementsToSearch[key];
      for (let element of elements) {
        let tagId = element.tagId;
        let lsId = element.lsId;
        if ((tagId && lsId) && tagId === tagIdToSearch) {
          action[key] = element = _this.getElementByLsId(lsId);
        }
      }
    });
  };

  _this.getElementByLsId = function (lsId) {
    let list = document.querySelectorAll('[ls-id="' + lsId + '"]');
    if (list.length == 1) {
      return list[0];
    } else {
      console.log("There are not any element or there are more than one:" + lsId);
    }
  };
  `;

  //TODO: how initialize onclick before dom insertion
  var routeFunctionTemplate = `
  _this.route = function (route) {
    console.log("route is starting");
    var pageListener = _this.actionsByFragmentUrlRoute[route];

    var htmlToRender;
    if (typeof pageListener.render !== "undefined" && typeof pageListener.render === "function") {
      htmlToRender = pageListener.render();
    }else{
      if (typeof pageListener.ls_render !== "undefined" && pageListener[pageListener.ls_render] !== "undefined") {
        htmlToRender = document.createRange().createContextualFragment(pageListener[pageListener.ls_render].getHtml());
      }else{
        console.log("Action does not have render() method nor @DefaultPage annotation");
      }
    }

    document.getElementById("root").innerHTML = '';
    document.getElementById("root").appendChild(htmlToRender);

    if (typeof pageListener.applyBindings !== "undefined" && typeof pageListener.applyBindings === "function") {
      pageListener.applyBindings();
    }else{
      if(typeof pageListener.ls_actionListeners !== "undefined"){
        _this.applyActionBinding(pageListener);
      }
      if(typeof pageListener.ls_domElements !== "undefined"){
        _this.applyDomBinding(pageListener);
      }
    }
  };
  `;

  var locationHashChangedFunctionTemplate = `
  function locationHashChanged() {
    console.log(location.hash);
    var fragment = location.hash.replace("#","");
    if(!_this.actionsByFragmentUrlRoute[fragment]){
      console.log("There are not any @Action asociated to this route: "+fragment);
      return;
    }
    _this.route(fragment);
  }
  window.onhashchange = locationHashChanged;
  `;

  var globalAttributesTemplate = `
  _this.defaultFragmentUrlRoute = "@route";
  `;

  var instantiateVariableTemplate = `
  _this.context["@dependencyName"] = {
    getActionableElements : function() {
      var actionableElements = [];
      @actionableElementEntries
      return actionableElements;
    },
    getElements : function() {
      var modelElements = [];
      @modelElementEntries
      return modelElements;
    },
    getHtml : function() {
      return "@templateRawValue";
    }
  };
  `;

  var actionableElementEntryTemplate = `
  actionableElements.push({
    "tagId":"@htmlObjectId",
    "lsId":"@lsId",
  });
  `;

  var modelElementEntryTemplate = `
  modelElements.push({
    "tagId":"@htmlObjectId",
    "lsId":"@lsId",
  });
  `;

  _this.createModule = function(options, content) {

    var headAnnotations = ["DefaultAction"];
    var internalAnnotations = ["Autowire","DomElement","Render","ActionListener"];

    LinksStartWebpackLoaderCommon.logDebug("srcLocation:" + options.srcLocation);
    var dependencies = DependencyHelper.getDependecies(options.srcLocation, [".js", ".html"], ["src/index.js", "src/index.html"],
    headAnnotations, internalAnnotations);

    LinksStartWebpackLoaderCommon.logDebug("\nNormalized dependencies");
    LinksStartWebpackLoaderCommon.logDebug(dependencies);

    LinksStartWebpackLoaderCommon.logDebug("\nPerform instantation...");
    var requires = "";
    var instantiates = "";
    var fragmentListeners = "";
    var defaultFragmentUrlRoute;
    for (dependency of dependencies) {
      var dependencyClassName = LinksStartWebpackLoaderCommon.capitalize(dependency.meta.arguments.name);

      if (dependency.meta.name == "Page") {
        var rawStringTemplate = LinksStartWebpackLoaderCommon.getHtmlTemplateAsString(dependency.location);
        var actionableElementEntries = "";
        var modelElementEntries = "";

        const $ = cheerio.load(rawStringTemplate);
        $('*').each(function(index, element) {
          if ($(element)) {
            if ($(element).attr('ls-model') === "true") {
              var htmlObjectId = $(element).attr('id');
              if (htmlObjectId) {
                let uniqueId = Math.floor(Math.random() * 100001);
                var entry = modelElementEntryTemplate.replace("@htmlObjectId", htmlObjectId);
                entry = entry.replace("@lsId", uniqueId);
                modelElementEntries = modelElementEntries.concat("\n").concat(entry);
                $(element).attr("ls-id", uniqueId);
              }
            } else if ($(element).attr('ls-actionable') === "true") {
              var htmlObjectId = $(element).attr('id');
              if (htmlObjectId) {
                let uniqueId = Math.floor(Math.random() * 100001);
                var entry = actionableElementEntryTemplate.replace("@htmlObjectId", htmlObjectId);
                entry = entry.replace("@lsId", uniqueId);
                actionableElementEntries = actionableElementEntries.concat("\n").concat(entry);
                $(element).attr("ls-id", uniqueId);
              }
            }
          }
        });

        var fixedHtmlTemplate = LinksStartWebpackLoaderCommon.fixString($.html());

        //instantiate
        var instantiateSentence = instantiateVariableTemplate
          .replace("@dependencyName", dependency.arguments.name)
          .replace("@templateRawValue", fixedHtmlTemplate)
          .replace("@actionableElementEntries", actionableElementEntries)
          .replace("@modelElementEntries", modelElementEntries);

        instantiates = instantiates.concat("\n").concat(instantiateSentence);
      } else { //default is Action
        //get require
        var requireSentence = requireTemplate
          .replace("@dependencyClassName", dependencyClassName)
          .replace("@dependencyLocation", dependency.meta.location.replace(options.srcLocation,"."));
        requires = requires.concat("\n").concat(requireSentence);
        //instantiate
        var instantiateSentence = instantiateModuleTemplate
          .replace("@dependencyClassName", dependencyClassName)
          .replace("@dependencyName", dependency.meta.arguments.name);
        instantiates = instantiates.concat("\n").concat(instantiateSentence);

        if (dependency.meta.arguments.route) {
          var fragmentMappingSentence = fragmentMappingTemplate
            .replace("@route", dependency.meta.arguments.route)
            .replace("@dependencyName", dependency.meta.arguments.name);
          fragmentListeners = fragmentListeners.concat("\n").concat(fragmentMappingSentence);
        }

        //lookup default entry point
        if (dependency.meta.arguments.entrypoint == "true") {
          if (dependency.meta.arguments.route) {
            defaultFragmentUrlRoute = dependency.meta.arguments.route;
          }
        }
      }

    }

    // LinksStartWebpackLoaderCommon.logDebug("\nPerform injection...");
    // var injections = "";
    // for (dependency of dependencies) {
    //
    //   var variablesToInject = dependency.variablesToInject;
    //
    //   for (variableToInject of variablesToInject) {
    //     var injectionSentence = injectionTemplate
    //       .replace(new RegExp("@dependencyName", 'g'), dependency.arguments.name)
    //       .replace(new RegExp("@autowireName", 'g'), variableToInject);
    //     injections = injections.concat("\n").concat(injectionSentence);
    //   }
    //
    // }

    var defaultFragmentUrlSentence;
    if (defaultFragmentUrlRoute) {
      defaultFragmentUrlSentence = globalAttributesTemplate
      .replace("@route", defaultFragmentUrlRoute);
    } else {
      defaultFragmentUrlSentence = "console.log('There are not any @Action defined as entrypoint')";
    }

    var entrypointModule = entrypointTemplate
      .replace("@defaultFragmentUrlSentence", defaultFragmentUrlSentence)
      .replace("@require", requires)
      .replace("@instantiate", instantiates)
      // .replace("@injection", injections)
      .replace("@fragmentListeners", (fragmentListeners.length > 0 ? fragmentListeners : ""));



    //create start function
    // var readyModule = LinksStartWebpackLoaderCommon.addNotParametrizableTemplateFunction(flashBootApplicationTemplate, stringStartFunction);
    // readyModule = LinksStartWebpackLoaderCommon.addNotParametrizableTemplateFunction(readyModule, routeFunctionTemplate);
    // readyModule = LinksStartWebpackLoaderCommon.addNotParametrizableTemplateFunction(readyModule, locationHashChangedFunctionTemplate);
    // readyModule = LinksStartWebpackLoaderCommon.addNotParametrizableTemplateFunction(readyModule, mainPageAttribute);

    // readyModule = readyModule.concat("\n").concat(linkStartFunctionTemplate);
    content = entrypointModule.concat("\n").concat(content);

    LinksStartWebpackLoaderCommon.logDebug("\nentrypoint is ready!!\n\n");
    LinksStartWebpackLoaderCommon.logDebug(content);

    return content;

  }
}


module.exports = EntrypointModuleCreator;
