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
      for (var k = 0; k < tfs[j].story.paragraphs.length; k++) {
        if (tfs[j].story.contents != "" && tfs[j].story.paragraphs[k].contents.length > 1) { // Empty strings (AI text frames) are skipped, as well as single character entries
          try {
            /* Update object for JSON */
            jfile[doc.name]["frames_" + j]["paragraphs_" + String(k)] = {};
            jfile[doc.name]["frames_" + j]["paragraphs_" + String(k)].contents = tfs[j].story.paragraphs[k].contents;

            /* Expand POT */
            potfile += "#: " + doc.name + ":" + j + "." + String(k) + "\n";
            potfile += "msgid \"" +  tfs[j].story.paragraphs[k].contents.replace(/"/g, '\\"') + "\"\nmsgstr \"\"\n\n";

            /* To make it easier to find relevant string, we update the frame object name */
            tfs[j].name = j + ": " + tfs[j].story.paragraphs[k].contents;
          } catch (e) {
            continue ;
          }
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
      tempFile = new File(targetFolder.fsName + "/" + "extract_texts" + ((exportFormat === "JSON") ? ".json" : ".pot"));
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

var dialog = new Window("dialog", "Select File Type");
var jsonRadio = dialog.add("radiobutton", undefined, "JSON");
var potRadio = dialog.add("radiobutton", undefined, "POT");
var confirmButton = dialog.add("button", undefined, "OK");

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