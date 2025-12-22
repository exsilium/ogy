import * as fs from 'fs';
import * as path from 'path';
import { assert } from "chai";
import { fileURLToPath } from "url";
import { YuGiOh } from '../src/compressor.js';
import { YgoTexts } from '../src/ygotexts.js';
import { Ehp } from "../src/ehp.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
describe("ogy application level tests - card", () => {
    beforeEach(done => setTimeout(done, 200));
    it("setup test data files", () => {
        fs.copyFile(__dirname + "/data/tf6/CARD_Desc_J.bin", __dirname + "/CARD_Desc_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_Genre.bin", __dirname + "/CARD_Genre.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_Huff_J.bin", __dirname + "/CARD_Huff_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_Indx_J.bin", __dirname + "/CARD_Indx_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_IntID.bin", __dirname + "/CARD_IntID.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_Name_J.bin", __dirname + "/CARD_Name_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_Pass.bin", __dirname + "/CARD_Pass.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_Prop.bin", __dirname + "/CARD_Prop.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_SamePict_J.bin", __dirname + "/CARD_SamePict_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_Sort_J.bin", __dirname + "/CARD_Sort_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_Top_J.bin", __dirname + "/CARD_Top_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/DICT_J.bin", __dirname + "/DICT_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/CARD_SamePict_J.bin", __dirname + "/CARD_SamePict_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/DLG_Indx_J.bin", __dirname + "/DLG_Indx_J.bin", (err) => { if (err)
            throw err; });
        fs.copyFile(__dirname + "/data/tf6/DLG_Text_J.bin", __dirname + "/DLG_Text_J.bin", (err) => { if (err)
            throw err; });
    });
    it("check test data files", () => {
        assert.equal(fs.existsSync(__dirname + "/CARD_Desc_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_Genre.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_Huff_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_Indx_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_IntID.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_Name_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_Pass.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_Prop.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_SamePict_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_Sort_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_Top_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/DICT_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/CARD_SamePict_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/DLG_Indx_J.bin"), true);
        assert.equal(fs.existsSync(__dirname + "/DLG_Text_J.bin"), true);
    });
    /*
      The most simple test is to extract the Card Info files from the unpacked .EHP file, this produces:
        - CARD_Dest_J.txt - The main card descriptor file
        - DICT_J.txt - Dictionary for Huffman coding
     */
    it("extraction of CARD_Desc_J.txt and DICT_J.txt should work", async () => {
        const ygoTextInstance = new YgoTexts();
        const result = await ygoTextInstance.exportToTxt(__dirname, YuGiOh.TF6);
        assert.equal(fs.existsSync(__dirname + "/CARD_Desc_J.txt"), true);
        assert.equal(fs.existsSync(__dirname + "/DICT_J.txt"), true);
    });
    /*
      Let's compare that the output is similar to what we expect and got with the YGTool.
      A buffer level comparison will not work because the first line stores file location specific data
      and there are line ending related differences. We remove the first line and the line endings
     */
    it("check the results for CARD_Desc_J.txt", () => {
        let data = fs.readFileSync(__dirname + "/CARD_Desc_J.txt").toString('utf-8');
        let compareData = fs.readFileSync(__dirname + "/data/tf6/ygtool/CARD_Desc_J.txt").toString('utf8');
        data = data.substring(data.indexOf('\n')).replace(/[\n\r]/g, "");
        compareData = compareData.substring(compareData.indexOf('\n') + 1).replace(/[\n\r]/g, "");
        assert.equal(data, compareData);
    });
    it("check the results for DICT_J.txt", () => {
        let data = fs.readFileSync(__dirname + "/DICT_J.txt").toString('utf-8');
        let compareData = fs.readFileSync(__dirname + "/data/tf6/ygtool/DICT_J.txt").toString('utf8');
        data = data.replace(/[\n\r]/g, "");
        compareData = compareData.replace(/[\n\r]/g, "");
        assert.equal(data, compareData);
    });
    /*
    This Test is to update the Dictionary file
      - DICT_J.bin will get updated
    */
    it("update of DICT_J.bin", () => {
        const DICTJtxt = fs.readFileSync(__dirname + "/DICT_J.txt", 'utf8');
        const ygoTextInstance = new YgoTexts();
        ygoTextInstance.updateDict(DICTJtxt, __dirname + "/DICT_J.txt");
        const data = fs.readFileSync(__dirname + "/DICT_J.bin");
        const compareData = fs.readFileSync(__dirname + "/data/tf6/ygtool/DICT_J.bin");
        assert.equal(Buffer.compare(data, compareData), 0);
    });
    /*
    This is more realistic use-case where we actually want to update back the Card Descriptions.
    When doing so, several files will get updated:
      - CARD_Name_J.bin <-- binary similarity with YGTool
      - DICT_J.bin <-- binary similarity YGTool
    */
    it("update of Card descriptions", () => {
        const CardDesc = fs.readFileSync(__dirname + "/CARD_Desc_J.txt", 'utf8');
        const ygoTextInstance = new YgoTexts();
        ygoTextInstance.updateCardDesc(CardDesc, __dirname + "/CARD_Desc_J.txt", false);
        const data = fs.readFileSync(__dirname + "/CARD_Desc_J.bin");
        const compareData = fs.readFileSync(__dirname + "/data/tf6/ogy/CARD_Desc_J.bin");
        assert.equal(Buffer.compare(data, compareData), 0);
    });
    it("check Huffman consistency", () => {
        const dataHuff = fs.readFileSync(__dirname + "/CARD_Huff_J.bin");
        const compareDataHuff = fs.readFileSync(__dirname + "/data/tf6/ogy/CARD_Huff_J.bin");
        assert.equal(Buffer.compare(dataHuff, compareDataHuff), 0);
    });
    it("check Index consistency", () => {
        const dataIndx = fs.readFileSync(__dirname + "/CARD_Indx_J.bin");
        const compareDataIndx = fs.readFileSync(__dirname + "/data/tf6/ogy/CARD_Indx_J.bin");
        assert.equal(Buffer.compare(dataIndx, compareDataIndx), 0);
    });
    it("check Card Name consistency", () => {
        const dataName = fs.readFileSync(__dirname + "/CARD_Name_J.bin");
        const compareDataName = fs.readFileSync(__dirname + "/data/tf6/ygtool/CARD_Name_J.bin");
        assert.equal(Buffer.compare(dataName, compareDataName), 0);
    });
    it("check Dictionary consistency", () => {
        const data = fs.readFileSync(__dirname + "/CARD_Desc_J.bin");
        const compareData = fs.readFileSync(__dirname + "/data/tf6/ogy/CARD_Desc_J.bin");
        assert.equal(Buffer.compare(data, compareData), 0);
    });
    it("clean up", () => {
        fs.unlinkSync(__dirname + "/CARD_Desc_J.bin");
        fs.unlinkSync(__dirname + "/CARD_Desc_J.txt");
        fs.unlinkSync(__dirname + "/CARD_Genre.bin");
        fs.unlinkSync(__dirname + "/CARD_Huff_J.bin");
        fs.unlinkSync(__dirname + "/CARD_Indx_J.bin");
        fs.unlinkSync(__dirname + "/CARD_IntID.bin");
        fs.unlinkSync(__dirname + "/CARD_Name_J.bin");
        fs.unlinkSync(__dirname + "/CARD_Pass.bin");
        fs.unlinkSync(__dirname + "/CARD_Prop.bin");
        fs.unlinkSync(__dirname + "/CARD_SamePict_J.bin");
        fs.unlinkSync(__dirname + "/CARD_Sort_J.bin");
        fs.unlinkSync(__dirname + "/CARD_Top_J.bin");
        fs.unlinkSync(__dirname + "/DICT_J.bin");
        fs.unlinkSync(__dirname + "/DICT_J.txt");
        fs.unlinkSync(__dirname + "/DLG_Indx_J.bin");
        fs.unlinkSync(__dirname + "/DLG_Text_J.bin");
    });
});
describe("ogy application level tests - ehp", () => {
    beforeEach(done => setTimeout(done, 200));
    it("setup test data files", () => {
        fs.copyFile(__dirname + "/data/tf6/cardinfo_jpn.ehp", __dirname + "/cardinfo_jpn.ehp", (err) => { if (err)
            throw err; });
    });
    it("extraction of .ehp to extract directory", () => {
        const ehp = new Ehp(__dirname + "/extract", __dirname + "/cardinfo_jpn.ehp");
        ehp.extract();
        assert.equal(fs.existsSync(__dirname + "/extract/CARD_Desc_J.bin"), true);
    });
    it("extracted files must match to originals", () => {
        const data = fs.readFileSync(__dirname + "/extract/CARD_Desc_J.bin");
        const compareData = fs.readFileSync(__dirname + "/data/tf6/CARD_Desc_J.bin");
        assert.equal(Buffer.compare(data, compareData), 0);
    });
    it("update of .ehp from extract directory", () => {
        const ehp = new Ehp(__dirname + "/extract", __dirname + "/cardinfo_jpn.ehp");
        ehp.update();
        assert.equal(fs.existsSync(__dirname + "/cardinfo_jpn.ehp"), true);
    });
    it("updated ehp must match to original", () => {
        const data = fs.readFileSync(__dirname + "/cardinfo_jpn.ehp");
        const compareData = fs.readFileSync(__dirname + "/data/tf6/cardinfo_jpn.ehp");
        assert.equal(Buffer.compare(data, compareData), 0);
    });
    it("clean up", () => {
        fs.unlinkSync(__dirname + "/cardinfo_jpn.ehp");
        fs.rmSync(__dirname + "/extract", { recursive: true, force: true });
    });
});
//# sourceMappingURL=index.spec.js.map