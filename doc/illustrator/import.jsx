/*
 * We rely on JSON format when importing strings back, this is to reduce writing more complex parsers in ExtendScript
 * ECMAScript 3 does not have modern JavaScript features implemented.
 *
 * Run: `node dist/index.js po2json input.po output.json` and use the output.json as the input for this import.jsx
 *
 */

#include "json2.jsx"
function main(target) {
  var f = File.openDialog("Select the source file", "*.json");
  if (f == null) {
    return;
  }
  f.open();
  f.encoding = "UTF-8";
  var json = f.read();
  $.writeln("JSON loaded: " + f.name);
  f.close();
  var jfile = JSON.parse(json);
  for (var i = 0; i < target.length; i++) {
    var v = false;
    try {
      var doc = app.open(File(target[i]));
      v = true;
    } catch (e) {
    }
    doc = app.activeDocument;
    var translations = jfile["translations"][""];
    var tfs = doc.textFrames;
    var importCounter = 0;

    for (var key in translations) {
      if (translations.hasOwnProperty(key)) {
        var translationObject = translations[key];

        if(translationObject.comments !== undefined) {
          if(translationObject.comments.reference !== undefined) {
            var references = translationObject.comments.reference.replace(/\n/g, " ");
            var referenceArray = references.split(" ");

            for (var i = 0; i < referenceArray.length; i++) {
              var splitReference = referenceArray[i].split(":");
              var stringId = parseInt(splitReference[splitReference.length - 1 ]);

              $.writeln("Parsing translation string ID: " + stringId);
              $.writeln("Searching for suitable textFrame...");

              for (var j = 0; j < tfs.length; j++) {
                if (tfs[j].name.length > 1) {
                  if(tfs[j].name.indexOf(":") > 0) {
                    var targetObjectName = parseInt(tfs[j].name.split(":")[0]);
                    if(!isNaN(targetObjectName)) {
                      if(targetObjectName === stringId) {
                        $.writeln("Match found - textFrame: " + j);
                        $.writeln("- Name: " + tfs[j].name);

                        /* If we have made a match, rewrite the contents of the textFrame */
                        if(translationObject.msgstr[0].length > 0) {
                          var translationStringArray = translationObject.msgstr[0].replace(/\\\"/g, "\"").split("<BR>");
                          for (var k = 0; k < translationStringArray.length; k++) {
                            try {
                              tfs[j].paragraphs[k].contents = translationStringArray[k];
                            } catch (e) {
                              continue;
                            }
                            $.writeln("textFrame updated");
                          }
                          /* Remove excess paragraphs */
                          if (translationStringArray.length < tfs[j].paragraphs.length) {
                            for(var k = tfs[j].paragraphs.length -1; k >= translationStringArray.length; k--) {
                              try {
                                tfs[j].paragraphs[k].remove();
                              } catch (e) {
                                continue;
                              }
                            }
                          }
                        }
                        else {
                          $.writeln("textFrame unchanged, empty msgstr object");
                        }
                        $.writeln("=== ... ===");
                      }
                    }
                  }
                }
              }
            }
          }
        }
        importCounter++;
      }
    }
    if (v) {
      doc.close(SaveOptions.SAVECHANGES);
    }
  }
  alert("Import complete, processed strings: " + importCounter);
}
function GetSubFolders(theFolder) {
  var myFiles = [];
  var myFileList = theFolder.getFiles();
  for (var q = 0; q < myFileList.length; q++) {
    var myFile = myFileList[q];
    if ((myFile instanceof File) && (/\.(ai|eps|svg)$/i.test(myFile.name))) {
      myFiles.push(File.decode(myFile));
    }
  }
  return myFiles;
}
var myScriptName = "Import script";

if (!app.documents.length) {
  var target = Folder.selectDlg("Select the source folder");
  if (target != null) {
    target = GetSubFolders(target);
    main(target);
  }
}
else {
  var target = [app.activeDocument];
  main(target);
}
