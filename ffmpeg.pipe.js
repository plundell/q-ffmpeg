/*
* @module ffmpeg
* @author plundell <qmusicplayer@protonmail.com>
* @license Apache-2.0
* @description Wrapper for ffmpeg which produces a readable stream from a target local or remote file
* @depends libbetter
* @exports function   Call once with dependencies to yield:
* @return function    Object of methods that should be registered as backend endpoints 
*/

module.exports=function exportFFmpeg(scope,settings){


    const log=new scope.BetterLog('FFmpeg');
    const cX=scope.BetterUtil.cX
    const ffmpegStream=scope.BetterUtil.cpX.spawnReadable.ffmpeg 
    const ffmpegSync=scope.BetterUtil.cpX.execFileSync.ffmpeg
    const argsToString=scope.BetterUtil.cpX.argsToString





  //When this file loads, check which formats and codecs the local ffmpeg/ffplay supports (create object for faster lookup later).
	/*
	* NOTE:
	*	codecs => the actual algorithm used to store the media data
	*   formats => file formats => the wrapper around the media data. Some formats use specific codecs, while other formats can contain
	*				media in different/multiple codecs (eg. video files which contain both video and audio)
	*/
	const supportedFormats=cX.objCreateFill(getSupportedFordecs('formats',/^\s*DE?\s+([\w,]+)/),null);
	const supportedCodecs=cX.objCreateFill(getSupportedFordecs('codecs',/^\s*D.A...\s+([\w,]+)/),null);


	/*
	* @param string which 	Can be 'codecs' or 'formats' (as in file formats)
	*
	* @return array 	Array of strings, each being a supported codecs or formats
	*/
	function getSupportedFordecs(which,regexp){
		try{
			var str=ffmpegSync([`-${which}`]).stdout;
		}catch(err){
			log.error(`Failed to determine supported ${which}`,err);
			log.warn("YOU WILL NOT BE ABLE TO PLAY ANYTHING");
			return [];
		}

		//Turn string into array of non-empty lines
		var arr=str.split('\n').filter(line=>!cX.isEmpty(line,'*'));

		//Remove the first few lines until we reach a '---'
		while(arr.shift().trim().substring(0,2)!='--'){}

		//Now loop through lines and save any format for which we have decode capability
		var list=[]
		arr.forEach(line=>{
			var m=line.match(regexp);
			if(m)
				list=list.concat(m[1].split(',')); //in case there are multiple fordecs on one line
		})

		if(!list.length)
			log.throw(`No supported ${which} found`);
		else
			log.info(`Found ${list.length} supported ${which}`);
		
		return list;
	}


	/*
	* Check if a track is supported based on it's codec and format
	*
	* @param <trackObj> track 	An object with props .format and .codec which are checked against the 
	*							known formats and codecs we support
	*
	* @return bool|undefined 	Undefined if format or codec is not given
	* @exported
	*/
	function isSupported(track){
		cX.checkType(['object','<TrackObj>'],track);

		if(!track.format || !track.codec)
			return undefined;

		if(!supportedFormats.hasOwnProperty(track.format)){
			log.warn("Unsupported format: "+track.format,track)
			return false;
		}

		if(!supportedCodecs.hasOwnProperty(track.codec)){
			log.warn("Unsupported codec: "+track.codec,track)
			return false;
		}
		log.info(`Format (${track.format}) and codec (${track.codec}) of ${track.uri} are supported`);
		return true;
	}	



	/*
	* Spawn ffmpeg, add some error handling and return the child
	*
	* @return <ChildProcess> 	
	*/
	function ffmpeg(args,_log){
		_log=_log||log;

		//The args we'll be passing look like this
		//  ffmpeg [global_options] {[input_file_options] -i input_url} ... {[output_file_options] output_url} ...
		//so prepend the some common global args...
		args=['-loglevel', 'error','-vn','-dn','-sn'].concat(args);
		//loglevel - only output error and above to stderr
		//-vn,-dn,-sn = skip video, data and subtiltle streams

		//Create a promise that spawns ffmpeg and returns with a readable stream when it's become readable
		_log.debug(`About to spawn: "ffmpeg ${argsToString(args)}"`)
		var child=ffmpegStream(args)

		//Any failure and we log everything written to stderr
		child.readablePromise.catch(function failed([err,child]){
			//If any err output was produced, log it
			if(child._stderr.length)
				_log.warn(`${child.who} STDERR:`,'\n\t'+child._stderr.join('\n\t')+'\n');
		})

		return child;
	}

	/*
	* Get the passed in log, or the local one
	* @param <arguments> args 	The arguments object of another func call
	* @return <BetterLog> 		
	*/
	function getLog(args){
		return cX.getFirstOfType(args,'<BetterLog>')||log;
	}




	/*
	* @return array 	An array of args ready to be appeneded then passed to ffmpeg
	*/
	function inputArgs(input){
		//The args we'll be passing look like this
		//  ffmpeg [global_options] {[input_file_options] -i input_url} ... {[output_file_options] output_url} ...
		//so prepend the some common global args...
		var args=['-loglevel', 'error','-vn','-dn','-sn'];
		//loglevel - only output error and above to stderr
		//-vn,-dn,-sn = skip video, data and subtiltle streams

		//A single string would be the format which is the most important thing if we're reading from stdin
		if(cX.checkType(['string','object','undefined'],input)=='string')
			input={format:input};
		else if(!input)
			return args;

		/* 
		* Pro note:
		*	codecs => the actual algorithm used to store the media data
		*   formats => file formats => the wrapper around the media data. Some formats use specific codecs, while other formats can contain
		*				media in different/multiple codecs (eg. video files which contain both video and audio)
		*/

		//Then apply the input options (ie. how should the incoming stream be enterpreted. leaving them blank will cause ffmpeg to guess)
		if(input.format)
			args.push('-f',input.format);
		else
			log.note("No incoming format info, ffmpeg will be forced guess...");

		if(input.codec)
			args.push('-codec:a',input.codec);

		return args;
	}

	/*
	* Alter the array returned by inputArgs()
	*
	* @param array arr
	* @param string|object output
	*
	* @return void;
	*/
	function outputArgs(arr,output){
		//A single string would be the format which is the most important thing if we're reading from stdin
		if(cX.checkType(['string','object','undefined'])=='string')
			output={format:output};
		else if(!output)
			return;

		//Apply transformations to the output
		if(output.format)
			arr.push('-f',output.format);
		if(output.codec)
			arr.push('-codec:a',output.codec);
	}


	/*
	* Consume from a stream, outputting it to a local inode (which could be a device or a named pipe).
	*
	* @return <ChildProcess>  
	*/
	function sink(inputFormat,dest,seek,outputFormat){

		var args=inputArgs(inputFormat);
		args.push('-i',path);

		//Discard initiate frames if desired, ie. seek to a specific timestamp
		if(seek>0)
			args.push('-ss',seek);
			  //^ -ss can technically be applied to input too, which is faster but less precise (and seems to generate stderr)
		
		//Output either to a device or a named pipe
		switch(dest){
			case 'speakers':
			case 'speaker':
			case 'local':
			case 'default':
				args.push(outputFormat||'alsa','default');
				break;
			default:
				outputArgs(args,outputFormat);
				args.push(dest);
		}

		//Spawn ffmpeg and return the child
		return ffmpeg(args,getLog(arguments));

	}

	/*
	* Create a stream from a local file or remote url
	*
	* @param string path 	The filepath or url to the audio file
	* @opt string format 	The format of the audio file (so we know how to decode it). If omitted ffmpeg will try to guess
	*
	* @return <ChildProcess>  
	*/
	function source(path,inputFormat){

		var args=inputArgs(inputFormat)

		args.push('-i',path);

		//Spawn ffmpeg and return the child
		return ffmpeg(args,getLog(arguments));

	}

	/*
	* Transform a stream, either recoding it and/or adding mixing effects
	*
	* @return <ChildProcess>  
	*/
	function transform(inputFormat,output){
		cX.checkTypes(['object','object'],arguments);

		//Start with info about the incoming stdin (which whoever is using this will pipe to...)
		var args=inputArgs(inputFormat)
		args.push('-i','-');

		//Apply transformations to the output
		if(output.format)
			args.push('-f',output.format);
		if(output.codec)
			args.push('-codec:a',output.codec);

		//Write to stdout (which node will read from...)
		args.push('-')

		//Spawn ffmpeg and return the child
		return ffmpeg(args,getLog(arguments));

	}


	return {isSupported,sink,source,transform}
}










	// /*
	// * Use ffmpeg to read from stdin and output to a named pipe or physical device
	// *
	// * @param object track 		    
	// * @param object options 	    Object of options. The following are available
	// *   @opt string options.format    A file/container format to OUTPUT the readable as, eg. 'wav'
	// * @opt <BetterLog> 			    Used to log if passed
	// *
	// * @return <ChildProcess> 	Resolves with a ffmpeg process (when it's become readable), rejects with <ble> error
	// */
	// function ffmpeg(input='-',output='default',_log=null){
	// 	var [_input,_output]=cX.checkTypes([['string','object'],['string','object'],['<BetterLog>','undefined']],[input,output,_log]);
		
	// 	//For same handling, turn into objects...
	// 	input=_input=='string'?{'input':input}:input;
	// 	output=_output=='string'?{'output':output}:output; 


	// 	/* 
	// 	* Pro note:
	// 	*	codecs => the actual algorithm used to store the media data
	// 	*   formats => file formats => the wrapper around the media data. Some formats use specific codecs, while other formats can contain
	// 	*				media in different/multiple codecs (eg. video files which contain both video and audio)
	// 	*/

	// 	//Then apply the input options (ie. how should the incoming stream be enterpreted. leaving them blank will cause ffmpeg to guess)
	// 	if(input.format)
	// 		args.push('-f',input.format);
	// 	if(input.codec)
	// 		args.push('-codec:a',input.codec);

	// 	args.push('-i',input.input||'-'); //to make sure that ^ options apply to the incoming stream we need to set -i option
		


	// 	//Then move on to the output...

	// 	if(output.seek>0)
	// 		args.push('-ss',output.seek);
	// 		//2019-07-15: Moved -ss to AFTER -i so we discard already decoded frames (more precise but slower). While ffmpeg
	// 		//			  seems to handle actually seeking in both cases, doing it before causes complaints on stderr which
	// 		//			  we want to avoid, so we just do it after...
		
	// 	args.push('-acodec',output.codec ? output.codec : 'copy'); //if none was specified, just copy the input (much faster)
		

	// 	if(output.output=='default' || output.output=='speakers'){
	// 		args.push('-f',output.format||'alsa','default'); //2019-07-15: ffmpeg output device... ?? see more @ https://ffmpeg.org/ffmpeg-devices.html#Output-Devices
	// 		  //^NOTE: when using 'alsa', first song you play produces a few clicks right at the begining... this may be because we're automatically 
	// 		  //      turning off pulse or something and switching to alsa... maybe we want to change to pulse...
	// 	}else{
	// 		let format=output.format||output.streamFormat||output.outputFormat; //allow some aliases
	// 		if(format)
	// 			args.push('-f',format);

	// 		args.push(output.output);
	// 	}
					
	// 	//Intiate the child process and return it
	// 	return ffmpeg(args,_log);

	// }