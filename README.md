# q-ffmpeg
This is a *pipe* app for [Q Music Player](https://qmusicplayer.se) that wraps around ffmpeg to provide a suitable api. It's a 1st party app which and listed in [q-repo](https://github.com/plundell/q-repo).

## Functionality
* source: read local or remote files
* transform: process a stream, eg. re-coding it or applying effects
* sink: output stream to any inode (file,socket,device)
