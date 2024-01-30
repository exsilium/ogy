#
# Kaitai Struct definition for .EHP container files - a proprietary file format
# used to bundle together various types of game data on Sony PSP
#

meta:
  id: ehp
  file-extension: ehp
  endian: le

seq:
  - id: header
    type: main_header
  - id: file_entries
    type: file_entries
    repeat: expr
    repeat-expr: header.file_count
  - id: file_entry_padding
    contents: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    doc: This padding seems constant
  - id: file_info
    type: file_info
    repeat: expr
    repeat-expr: header.file_count
  - id: file_info_padding
    type: u1
    repeat: expr
    repeat-expr: padding_size_to_16
    doc: This seems dynamic padding to align to 16 bytes
  - id: file_data
    type: file_data

instances:
  padding_size_to_16:
    value: '(16 - (_io.pos % 16)) % 16'

types:
  main_header:
    seq:
      - id: magic
        contents: [0x45, 0x48, 0x50, 0x03]
        doc: Magic header - EHP 0x03
      - id: total_filesize
        type: u4
        doc: Total file size in bytes
      - id: magic2
        size: 4
        doc: Varied from 0 bytes to other small strings, used during runtime to lock usage
      - id: file_count
        type: u4
        doc: Number of files included in this bundle

  file_entries:
    seq:
      - id: file_info_location
        size: 4
      - id: file_start_location
        size: 4

  file_info:
    seq:
      - id: filename
        type: strz
        encoding: UTF-8
      - id: filesize
        type: u4
        doc: Number of bytes

  file_data:
    seq:
      - id: file_data_entries
        type: file_data_entry(_parent.file_info[_index].filesize)
        repeat: expr
        repeat-expr: _parent.header.file_count

  file_data_entry:
    params:
      - id: filesize
        type: u4
    seq:
      - id: data
        size: filesize
      - id: padding
        type: u1
        repeat: expr
        repeat-expr: '(16 - (filesize % 16)) % 16'
