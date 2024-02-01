#include "json2.jsx"

var exportFormat = "JSON";

var potHeader = '#, fuzzy\n' +
  'msgid ""\n' +
  'msgstr ""\n' +
  '"Project-Id-Version: PACKAGE VERSION\\n"\n' +
  '"POT-Creation-Date: ' + getCurrentDateString() + '\\n"\n' +
  '"PO-Revision-Date: YEAR-MO-DA HO:MI+ZONE\\n"\n' +
  '"Last-Translator: FULL NAME <EMAIL@ADDRESS>\\n"\n' +
  '"Language-Team: LANGUAGE <LL@li.org>\\n"\n' +
  '"Language: \\n"\n' +
  '"MIME-Version: 1.0\\n"\n' +
  '"Content-Type: text/plain; charset=UTF-8\\n"\n' +
  '"Content-Transfer-Encoding: 8bit\\n"\n\n';

function main(target) {
  /* Main logic to extract text items */
  var jfile = {}; // JSON object file
  var potfile = potHeader; // POT string file
  for (var i = 0; i < target.length; i++) {
    var v = false;
    try {
      var doc = app.open(File(target[i]));
      v = true;
    } catch (e) {
    }
    doc = app.activeDocument;
    /* Each file we give a separate object */
    jfile[doc.name] = {};
    var tfs = doc.textFrames;
    for (var j = 0; j < tfs.length; j++) {
      jfile[doc.name]["frames_" + j] = {};
      /* We skip the text element if the name begins with "DNT:" (Do Not Translate) */
      if (tfs[j].name.indexOf("DNT:") !== 0) {
        var msgid = "";
        for (var k = 0; k < tfs[j].story.paragraphs.length; k++) {
          // Empty strings (AI text frames) are skipped, as well as single character entries
          if (tfs[j].story.contents != "" && tfs[j].story.paragraphs[k].contents.length > 1) {
            try {
              /* In Adobe .AI context, a paragraph is considered a single line */
              /* Update object for JSON, each paragraph a separate object within a frame structure */
              jfile[doc.name]["frames_" + j]["paragraphs_" + String(k)] = {};
              jfile[doc.name]["frames_" + j]["paragraphs_" + String(k)].contents = tfs[j].story.paragraphs[k].contents;

              /* Expand POT */
              if(k === 0) {
                /* First paragraph/line of the text object, we create the POT entry */
                msgid = "#: " + doc.name + ":" + j + "\nmsgid \"\"\n\"";

                /* To make it easier to find relevant string, we update the frame object name */
                tfs[j].name = j + ": " + tfs[j].story.paragraphs[k].contents;
              }
              else {
                /* Paragraph/line separator in the translation string */
                msgid += "<BR>";
              }
              msgid += tfs[j].story.paragraphs[k].contents.replace(/"/g, '\\"');
            } catch (e) {
              continue;
            }
          }
        }
        if(msgid.length > 0) {
          /* We actually added something to msgid expand POT */
          /* We clone the string and add a separator */
          potfile += msgid + "\"\nmsgstr \"\"\n\n";
        }
      }
    }
    if (v) {
      doc.close(SaveOptions.SAVECHANGES);
    }
  }

  var conts = "";
  if(exportFormat === "POT") {
    conts = potfile;
  }
  else {
    conts = JSON.stringify(jfile);
  }

  writeTXT(conts);
}
function writeTXT(array) {
  if (array.length > 0) {
    var targetFolder = Folder.selectDialog("Select a target directory for " + ((exportFormat === "JSON") ? ".json" : ".pot"));

    if (targetFolder) {
      alert("You selected: " + targetFolder.fsName);
      var tempFile = new File(targetFolder.fsName + "/" + app.activeDocument.name.replace(/\.ai/ig, "") + ((exportFormat === "JSON") ? ".json" : ".pot"));
      tempFile.encoding = "UTF-8";
      tempFile.open("w");
      tempFile.writeln(array);
      tempFile.close();
    } else {
      alert("No folder was selected. No output written.");
    }
  }
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

function getCurrentDateString() {
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth() + 1; // Months are zero-based
  var day = now.getDate();
  var hours = now.getHours();
  var minutes = now.getMinutes();

  // Pad single digit month, day, hours, and minutes with leading zeros
  month = (month < 10 ? "0" : "") + month;
  day = (day < 10 ? "0" : "") + day;
  hours = (hours < 10 ? "0" : "") + hours;
  minutes = (minutes < 10 ? "0" : "") + minutes;

  // Format the date string
  var dateString = year + "-" + month + "-" + day + " " + hours + ":" + minutes + "+0000";
  return dateString;
}

var myScriptName = "Export script";

var dialog = new Window("dialog", "Select File Type and Options");
//var potHeaderAdd = dialog.add("edittext", [0, 0, 600, 100], "", {multiline: true, name: "POT Header"});
var jsonRadio = dialog.add("radiobutton", undefined, "JSON");
var potRadio = dialog.add("radiobutton", undefined, "POT");
var confirmButton = dialog.add("button", undefined, "OK");

//potHeaderAdd.text = "# Yu-Gi-Oh! Portable Object Template - Ruleset V10\n# This file is distributed under the same license as the OGY package.\n#\n";

confirmButton.onClick = function() {
  if (jsonRadio.value) {
    exportFormat = "JSON";
  } else if (potRadio.value) {
    exportFormat = "POT";
  }
  dialog.close();
};

dialog.show();

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