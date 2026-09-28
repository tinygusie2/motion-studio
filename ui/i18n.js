// Interface languages. The editor is written with Dutch text in the code; this module translates what ends up on
// screen: text nodes, title/placeholder attributes and confirm()/prompt() messages. A key is the Dutch text, the value
// its translation. {0}, {1}, … in a key match any text and are carried into the value (in any order, translated too).
// Adding a language = adding a table below and an entry in `languages`. The preview (the video itself) is never
// translated: its text belongs to the video.

export const languages = { nl: 'Nederlands', en: 'English' };

const en = {
  // ---------- menu bar ----------
  'Bestand': 'File', 'Bewerken': 'Edit', 'Invoegen': 'Insert', 'Beeld': 'View', 'Afspelen': 'Playback', 'Exporteren': 'Export', 'Help': 'Help',
  'Nieuwe video…': 'New video…', 'Video dupliceren…': 'Duplicate video…', 'Video verwijderen…': 'Delete video…', 'Projecten…': 'Projects…',
  'Media uploaden…': 'Upload media…', 'Rendermap openen': 'Open renders folder', 'Instellingen…': 'Settings…', 'Afsluiten': 'Exit',
  'Ongedaan maken': 'Undo', 'Opnieuw': 'Redo', 'Knippen': 'Cut', 'Kopiëren': 'Copy', 'Plakken op playhead': 'Paste at playhead',
  'Plakken op dezelfde tijd': 'Paste at the same time', 'Alles selecteren': 'Select all', 'Dupliceren': 'Duplicate',
  'Splitsen op playhead': 'Split at playhead', 'Verwijderen': 'Delete', 'Deselecteren': 'Deselect', 'Merk bewerken…': 'Edit brand…',
  'Tekst': 'Text', 'Callout': 'Callout', 'Zoom': 'Zoom', 'Tik': 'Tap', 'Voice-over zin': 'Voice-over line', 'Ondertitel': 'Caption',
  'Marker op playhead': 'Marker at playhead', 'Tik-modus (klik = tik)': 'Tap mode (click = tap)', 'Ondertitels uit voice-over': 'Captions from voice-over',
  'Ondertitels importeren (.srt / .vtt)…': 'Import captions (.srt / .vtt)…', 'Preview-formaat': 'Preview format', 'TikTok-veilige zone': 'TikTok safe zone',
  'Beats van de muziek (tonen + snappen)': 'Music beats (show + snap)', 'Tijdlijn inzoomen': 'Zoom timeline in', 'Tijdlijn uitzoomen': 'Zoom timeline out',
  'Volledig scherm': 'Full screen', 'Herladen': 'Reload', 'Ontwikkelaarstools': 'Developer tools', 'Pauzeren': 'Pause',
  'Naar begin': 'Go to start', 'Naar einde': 'Go to end', 'Vorige marker / beat': 'Previous marker / beat', 'Volgende marker / beat': 'Next marker / beat',
  '1 frame terug': 'Back 1 frame', '1 frame verder': 'Forward 1 frame', '1 seconde terug': 'Back 1 second', '1 seconde verder': 'Forward 1 second',
  'Render MP4': 'Render MP4', 'Batch renderen…': 'Batch render…', 'Voice-over maken': 'Make voice-over', 'Sneltoetsen': 'Keyboard shortcuts',
  'Over Motion Studio': 'About Motion Studio', 'Spatie': 'Space',
  'Motion Studio · editor voor korte motion-graphics video\'s, rendert met HyperFrames': 'Motion Studio · editor for short motion-graphics videos, renders with HyperFrames',

  // ---------- top bar, stage, timeline ----------
  'Project': 'Project', 'Geen project': 'No project', 'Opgeslagen': 'Saved', 'Wijzigingen…': 'Changes…', 'Opslaan mislukt': 'Save failed', 'Render': 'Render',
  'Project wisselen of nieuw project maken (Ctrl+O)': 'Switch project or create a new one (Ctrl+O)', 'Video openen': 'Open video',
  'Ongedaan maken (Ctrl+Z)': 'Undo (Ctrl+Z)', 'Opnieuw (Ctrl+Shift+Z)': 'Redo (Ctrl+Shift+Z)', 'Render MP4 (Ctrl+R)': 'Render MP4 (Ctrl+R)',
  'Formaat van de preview': 'Preview format', 'Tik-modus': 'Tap mode', 'Tik-modus: klik op het apparaat om tikken te plaatsen (T)': 'Tap mode: click the device to place taps (T)',
  'Sleep callouts, ondertitels en tikken in de preview om ze te verplaatsen': 'Drag callouts, captions and taps in the preview to move them',
  'Tik-modus: klik op het apparaat om een tik op de playhead te zetten, ook tijdens afspelen. Sleep de bolletjes om ze te verplaatsen. T of Esc = klaar.':
    'Tap mode: click the device to add a tap at the playhead, also during playback. Drag the dots to move them. T or Esc = done.',
  'Naar begin (Home)': 'Go to start (Home)', '1 frame terug (←)': 'Back 1 frame (←)', 'Afspelen (spatie)': 'Play (space)', '1 frame verder (→)': 'Forward 1 frame (→)',
  'Laden…': 'Loading…', 'Preview-fout (zie console)': 'Preview error (see console)',
  'Tijdlijn': 'Timeline', 'Beats': 'Beats', 'Beats van de muziek tonen en erop snappen': 'Show the music beats and snap to them',
  'Sleep blokken om te verschuiven, sleep randen om in te korten · Alt = zonder snappen · S = splitsen · , . = frame verschuiven · Del = verwijderen':
    'Drag blocks to move them, drag edges to trim · Alt = no snapping · S = split · , . = nudge a frame · Del = delete',
  'Hele video in beeld (\\)': 'Fit the whole video (\\)',
  'Telefoon': 'Phone', 'Telefoon 1': 'Phone 1', 'Telefoon 2': 'Phone 2', 'Tablet': 'Tablet', 'Browser': 'Browser', 'Callouts': 'Callouts',
  'Voice-over': 'Voice-over', 'Tikken': 'Taps', 'Ondertitels': 'Captions', 'Stem': 'Voice', 'Muziek': 'Music', 'Eindkaart': 'End card',
  'Marker {0}s\nKlik: erheen · sleep: verplaatsen · dubbelklik: weghalen': 'Marker {0}s\nClick: go there · drag: move · double-click: remove',
  'Laat los om te uploaden': 'Drop to upload',

  // ---------- library ----------
  'Toevoegen': 'Add', 'VO-zin': 'VO line', 'Clips': 'Clips', 'Upload': 'Upload', 'Audio': 'Audio',
  'Klik op een clip om hem op de playhead in de telefoon te zetten. Sleep bestanden hierheen om te uploaden.': 'Click a clip to put it on the device at the playhead. Drag files here to upload.',
  'Schermopnames (mp4, mov, webm), screenshots (png, jpg) of audio (wav, mp3)': 'Screen recordings (mp4, mov, webm), screenshots (png, jpg) or audio (wav, mp3)',
  'Nog geen audio. Upload muziek of een opname (wav, mp3, m4a).': 'No audio yet. Upload music or a recording (wav, mp3, m4a).',
  'Beluisteren': 'Listen', 'Als muziek onder de video': 'As music under the video', 'Als stem / audiospoor': 'As voice / audio track', 'Bestand verwijderen': 'Delete file',
  'stem': 'voice', 'muziek': 'music', 'foto': 'photo', 'Media': 'Media', 'Paneelgroottes herstellen': 'Reset panel sizes', 'Sleep om de breedte te wijzigen': 'Drag to change the width',
  'Sleep om de hoogte te wijzigen': 'Drag to change the height', 'dubbelklik: standaard': 'double-click: default', 'Selectie opheffen (Esc)': 'Deselect (Esc)', 'Zoeken': 'Search', 'Gebruikt in deze video': 'Used in this video', 'Of sleep naar de tijdlijn': 'Or drag it onto the timeline',
  'Klik om op de playhead te zetten, of sleep naar de tijdlijn. Nieuwe bestanden kun je overal in het venster neerzetten.': 'Click to put it at the playhead, or drag it onto the timeline. Drop new files anywhere in the window.',
  'Sleep schermopnames of screenshots hierheen, of klik om te uploaden': 'Drop screen recordings or screenshots here, or click to upload',
  'Sleep muziek of een opname hierheen (wav, mp3, m4a), of klik om te uploaden': 'Drop music or a recording here (wav, mp3, m4a), or click to upload',
  'Geen clips met "{0}"': 'No clips matching "{0}"', 'Geen audio met "{0}"': 'No audio matching "{0}"',
  'Sleep naar de tijdlijn: muziek vanaf dat punt (op de rij Stem: als stem)': 'Drag onto the timeline: music from that point (on the Voice row: as the voice)',
  '{0} ({1} × {2})\nKlik: op de playhead in het apparaat zetten\nShift+klik: telefoon 2': '{0} ({1} × {2})\nClick: put it on the device at the playhead\nShift+click: phone 2',
  '{0} ({1} × {2})\nKlik: op de playhead in het apparaat zetten': '{0} ({1} × {2})\nClick: put it on the device at the playhead',
  '{0}\nKlik: op de playhead in het apparaat zetten\nShift+klik: telefoon 2': '{0}\nClick: put it on the device at the playhead\nShift+click: phone 2',
  '{0}\nKlik: op de playhead in het apparaat zetten': '{0}\nClick: put it on the device at the playhead',
  'Klik: op de playhead in het apparaat zetten': 'Click: put it on the device at the playhead', 'Shift+klik: telefoon 2': 'Shift+click: phone 2',
  'Preview in {0} ({1})': 'Preview in {0} ({1})', 'wordt gerenderd': 'will be rendered',
  'Past niet goed in deze layout: er valt veel weg of het wordt flink vergroot. Klik de clip aan voor details.': 'Doesn\'t fit this layout well: a lot is cut off or it is enlarged a lot. Click the clip for details.',

  // ---------- inspector: video ----------
  'Bovenregel': 'Overline', 'Merk': 'Brand', 'Bewerk': 'Edit', 'Merk bewerken': 'Edit brand', '{0} (standaard)': '{0} (default)',
  'Layout': 'Layout', 'Twee telefoons': 'Two phones', 'Browservenster': 'Browser window', 'Browservenster (desktop)': 'Browser window (desktop)',
  'Volledig scherm (geen apparaat)': 'Full screen (no device)', 'Renderen in': 'Render in', '9:16 staand': '9:16 portrait', '4:5 feed': '4:5 feed', '1:1 vierkant': '1:1 square', '16:9 liggend': '16:9 landscape',
  'Render MP4 maakt elk aangevinkt formaat. Bekijk ze met de knoppen boven de preview; tekst en apparaat worden per formaat opnieuw geschikt.':
    'Render MP4 makes every ticked format. Preview them with the buttons above the preview; text and device are rearranged per format.',
  'Lengte (s)': 'Length (s)', 'Eindkaart vanaf (s)': 'End card from (s)', 'Eindkaart slogan': 'End card tagline', 'Naam links': 'Name left', 'Naam rechts': 'Name right',
  'Audio & voice-over': 'Audio & voice-over', 'Stem / audiospoor': 'Voice / audio track', 'Geen': 'None', 'Snelheid': 'Speed',
  '{0} ({1}, man)': '{0} ({1}, male)', '{0} ({1}, vrouw)': '{0} ({1}, female)',
  '{0} zin(nen) op de Voice-over track. Voeg zinnen toe met "VO-zin", zet ze op de juiste tijd en klik op maken. Het resultaat wordt het audiospoor.':
    '{0} line(s) on the Voice-over track. Add lines with "VO line", put them at the right time and click make. The result becomes the audio track.',
  'Video verwijderen': 'Delete video',
  'Spatie afspelen · ←/→ frame · Shift+←/→ 1 s · Home begin · S splitsen · Del verwijderen · Ctrl+D dupliceren · Ctrl+Z / Ctrl+Shift+Z · Esc deselecteren':
    'Space play · ←/→ frame · Shift+←/→ 1 s · Home start · S split · Del delete · Ctrl+D duplicate · Ctrl+Z / Ctrl+Shift+Z · Esc deselect',
  'Nog geen video': 'No video yet', 'Dit project heeft nog geen video. Upload eerst een schermopname of screenshot (links), en maak dan een video.':
    'This project has no video yet. Upload a screen recording or screenshot first (on the left), then make a video.',
  'Nieuwe video': 'New video', 'Merk instellen': 'Set up brand',

  // ---------- inspector: items ----------
  'Hook': 'Hook', 'hook': 'hook', 'Zet *sterretjes* om woorden heen voor de accentkleur. Blijft staan tot de volgende tekst.': 'Put *asterisks* around words for the accent color. Stays until the next text.',
  'Start (s)': 'Start (s)', 'Hook (grotere tekst, voor de opening)': 'Hook (bigger text, for the opening)',
  'Zoomt in op de telefoon en dimt de bovenkant zodat de tekst leesbaar blijft.': 'Zooms into the phone and dims the top so the text stays readable.',
  'Animatieduur (s)': 'Animation length (s)', 'Schaal': 'Scale', 'Verschuiving Y (px)': 'Y shift (px)', 'Terug uitzoomen op (s)': 'Zoom back out at (s)', 'tot de eindkaart': 'until the end card',
  'Focuspunt': 'Focus point', 'X (px)': 'X (px)', 'Y (px)': 'Y (px)', 'Focuspunt wissen': 'Clear focus point', 'Focuspunt gezet': 'Focus point set',
  'Dit punt van het scherm schuift naar het midden. Klik op het apparaat in de preview om een ander punt te kiezen.': 'This point of the screen moves to the middle. Click the device in the preview to pick another point.',
  'Klik op het apparaat in de preview om in te zoomen op dat punt, bijvoorbeeld een knop. Zonder focuspunt gebruikt de zoom de Y-verschuiving: negatief = naar de onderkant, positief = naar de bovenkant.':
    'Click the device in the preview to zoom in on that point, for example a button. Without a focus point the zoom uses the Y shift: negative = towards the bottom, positive = towards the top.',
  'Nog niet ingesproken. Klik op "Voice-over maken" om hem te genereren.': 'Not spoken yet. Click "Make voice-over" to generate it.', 'Ingesproken lengte: {0}s.': 'Spoken length: {0}s.',
  'Deze voice-over is gemaakt met een oudere versie: het geluid schuift nog niet mee als je de zin verplaatst. Klik één keer op "Voice-over maken" (ingesproken zinnen komen uit de cache, dus dat gaat snel).': 'This voice-over was made with an older version: its audio does not move with the line yet. Click "Make voice-over" once (spoken lines come from the cache, so it is quick).',
  'Sleep het oranje bolletje in de preview, of klik op het apparaat om de tik daarheen te zetten. Met Tik-modus (T) zet elke klik een nieuwe tik op de playhead, ook tijdens het afspelen.':
    'Drag the orange dot in the preview, or click the device to move the tap there. In Tap mode (T) every click adds a new tap at the playhead, also during playback.',
  'Tik-modus stoppen': 'Stop tap mode', 'Moment (s)': 'Moment (s)', 'Weergave': 'Look', 'Automatisch (vinger)': 'Automatic (finger)', 'Automatisch (muisaanwijzer)': 'Automatic (mouse pointer)',
  'Vinger': 'Finger', 'Muisaanwijzer': 'Mouse pointer', 'Tikken staan op de linker telefoon.': 'Taps go on the left phone.',
  'Tip: zet de tik net vóór het moment dat er in de opname iets verandert. Een tik zoomt mee met een zoom.': 'Tip: put the tap just before the moment something changes in the recording. A tap zooms along with a zoom.',
  'Stem / audiospoor': 'Voice / audio track', 'Bestand': 'File', 'Volume': 'Volume', 'Uit video halen': 'Remove from video',
  '"Voice-over maken" vervangt dit spoor door de nieuwe voice-over. Muziek zet je op een eigen spoor: klik links bij Audio op het muziek-icoon.':
    '"Make voice-over" replaces this track with the new voice-over. Music goes on its own track: click the music icon next to it under Audio on the left.',
  'In (s)': 'In (s)', 'Uit (s)': 'Out (s)', 'Splits op playhead': 'Split at playhead', 'Stijl (hele video)': 'Style (whole video)', 'verborgen': 'hidden',
  '*Sterretjes* = accentkleur. De woorden worden over de duur van het blok verdeeld en verschijnen {0} per keer.': '*Asterisks* = accent color. The words are spread over the length of the block and appear {0} at a time.',
  'Slogan': 'Tagline', '*Sterretjes* = accentkleur.': '*Asterisks* = accent color.', 'Begint op (s)': 'Starts at (s)', 'Video eindigt op (s)': 'Video ends at (s)',
  'Label (klein)': 'Label (small)', 'Kleur': 'Color', 'Icoon': 'Icon', 'material symbol naam': 'material symbol name',
  'Elke naam van fonts.google.com/icons werkt; het icoon-font wordt automatisch bijgewerkt.': 'Any name from fonts.google.com/icons works; the icon font updates automatically.',
  'Of sleep de callout in de preview.': 'Or drag the callout in the preview.', 'Of sleep de callout in de preview. Eigen positie in: {0}.': 'Or drag the callout in the preview. Own position in: {0}.',
  'Live-stip (knippert)': 'Live dot (blinks)', 'Optellend getal': 'Counting number', 'Telt tot': 'Counts to', 'Achtervoegsel': 'Suffix',
  'X in {0} (px)': 'X in {0} (px)', 'Y in {0} (px)': 'Y in {0} (px)', 'Eigen positie voor {0}.': 'Own position for {0}.', 'Terug naar de 9:16-positie': 'Back to the 9:16 position',
  'Volgt 9:16. Sleep de callout in deze preview om hem alleen in {0} te verplaatsen.': 'Follows 9:16. Drag the callout in this preview to move it in {0} only.',
  '{0} items geselecteerd': '{0} items selected', '{0}× {1}': '{0}× {1}', 'tekst': 'text', 'callout': 'callout', 'zoom': 'zoom', 'tik': 'tap', 'VO-zin': 'VO line', 'ondertitel': 'caption', 'clip': 'clip',
  'Ctrl+klik op de tijdlijn om items toe te voegen of weg te halen. Kopieer ze naar een andere video met Ctrl+C en plak daar met Ctrl+V (op de playhead) of Ctrl+Shift+V (op dezelfde tijd).':
    'Ctrl+click on the timeline to add or remove items. Copy them to another video with Ctrl+C and paste there with Ctrl+V (at the playhead) or Ctrl+Shift+V (at the same time).',

  // ---------- clips, fit, crop ----------
  'Clip': 'Clip', 'Clip · telefoon 2': 'Clip · phone 2', 'Afbeelding': 'Image', 'Afbeelding · telefoon 2': 'Image · phone 2', 'Bron': 'Source',
  'Schuif om het beginpunt in de opname te kiezen.': 'Slide to pick the starting point in the recording.', 'Combineer met een zoom voor beweging.': 'Combine with a zoom for movement.',
  'Start in video (s)': 'Start in video (s)', 'Duur (s)': 'Length (s)', 'Begin in bron (s)': 'Start in source (s)',
  'Let op: de clip loopt {0}s voorbij het einde van de opname ({1}s).': 'Note: the clip runs {0}s past the end of the recording ({1}s).',
  'Overgang naar deze clip': 'Transition into this clip', 'Harde overgang': 'Hard cut', 'Duur overgang (s)': 'Transition length (s)',
  'Overvloeien': 'Crossfade', 'Schuiven': 'Slide', 'Zwiep': 'Whip', 'Inzoomen': 'Zoom in',
  'Plaatsing in het scherm': 'Placement on the screen', 'Vullen': 'Fill', 'Passend': 'Fit', 'Bijsnijden…': 'Crop…', 'Uitsnede…': 'Crop…', 'Uitsnede weghalen': 'Remove crop',
  'Vult het hele scherm; wat niet past valt weg (bovenkant blijft staan)': 'Fills the whole screen; what doesn\'t fit is cut off (the top stays)',
  'Alles blijft zichtbaar; de rest van het scherm krijgt de achtergrondkleur': 'Everything stays visible; the rest of the screen gets the background color',
  'Kies zelf welk deel in beeld komt': 'Choose which part is shown',
  'Ideaal formaat voor {0}: {1} × {2} px (of {3} × {4}). In Chrome: F12 → Ctrl+Shift+M → Responsive {5} × {6}, DPR 2 → ⋮ → Capture screenshot.':
    'Ideal size for {0}: {1} × {2} px (or {3} × {4}). In Chrome: F12 → Ctrl+Shift+M → Responsive {5} × {6}, DPR 2 → ⋮ → Capture screenshot.',
  'telefoon': 'phone', 'twee telefoons': 'two phones', 'browservenster': 'browser window', 'volledig scherm': 'full screen', 'scherm': 'screen',
  '{0}: past precies.': '{0}: fits exactly.', '{0}: {1}.': '{0}: {1}.', 'Uitsnede {0} × {1}': 'Crop {0} × {1}',
  'de onderste {0} valt weg': 'the bottom {0} is cut off', 'links en rechts valt elk {0} weg': '{0} is cut off on each side',
  'links en rechts komt een rand van elk {0}': 'a {0} border on each side', 'boven en onder komt een rand van elk {0}': 'a {0} border at the top and bottom',
  'het wordt {0}× vergroot en daardoor minder scherp': 'it is enlarged {0}× and so less sharp',
  'Bijsnijden': 'Crop', 'Vorm van het scherm aanhouden (': 'Keep the screen\'s shape (', 'Hele beeld': 'Whole image', 'Toepassen': 'Apply',
  '{0} · {1} × {2} px. Sleep het kader of de hoeken. Het deel binnen het kader komt in het {3}.': '{0} · {1} × {2} px. Drag the frame or its corners. The part inside the frame goes on the {3}.',
  '{0} × {1} px · scherp': '{0} × {1} px · sharp', '{0} × {1} px · wordt {2}× vergroot (minder scherp)': '{0} × {1} px · enlarged {2}× (less sharp)',
  'Kon de bron niet laden.': 'Could not load the source.', 'Uitsnede toegepast': 'Crop applied', 'Uitsnede weggehaald': 'Crop removed',

  // ---------- audio ----------
  'Muziek': 'Music', 'Zachter onder de stem': 'Quieter under the voice', 'Ruimte voor de stem (EQ)': 'Room for the voice (EQ)', 'uit': 'off',
  '−{0} dB rond 1,6 kHz': '−{0} dB around 1.6 kHz',
  'Haalt tijdens het spreken alleen de spraakfrequenties uit de muziek. Zo blijft de stem verstaanbaar en kan de muziek voller blijven. Je hoort het ook in de preview.':
    'While the voice speaks, only the speech frequencies are taken out of the music. The voice stays clear and the music can stay fuller. You hear it in the preview too.',
  '{0}s → {1}s in de video · nummer {2}s. De lijn is het volume.': '{0}s → {1}s in the video · track {2}s. The line is the volume.',
  '{0}s → {1}s in de video. De lijn is het volume.': '{0}s → {1}s in the video. The line is the volume.',
  'Er is geen stemspoor, dus de muziek hoeft nergens zachter.': 'There is no voice track, so the music never needs to be quieter.',
  'Zakt weg onder {0} stuk(ken) voice-over en komt in de pauzes weer omhoog.': 'Drops under the voice-over ({0}×) and comes back up in the pauses.',
  'Het stemspoor heeft geen voice-over zinnen met een lengte, dus de muziek blijft de hele tijd zachter.': 'The voice track has no voice-over lines with a length, so the music stays quieter the whole time.',
  'Fade-in (s)': 'Fade in (s)', 'Fade-out (s)': 'Fade out (s)', 'Begin in nummer (s)': 'Start in track (s)',
  'Het nummer is {0}s te kort; daarna is het stil. Kort het muziekblok in of kies een eerder beginpunt.': 'The track is {0}s too short; after that it is silent. Trim the music block or pick an earlier starting point.',
  'Sleep het blok op de tijdlijn om het te verschuiven, sleep de randen om in te korten. Del haalt het uit de video.': 'Drag the block on the timeline to move it, drag the edges to trim. Del removes it from the video.',

  // ---------- captions ----------
  'Nog geen ondertitels. Maak ze uit de voice-over, importeer een .srt/.vtt of voeg losse blokken toe met "Ondertitel".': 'No captions yet. Make them from the voice-over, import an .srt/.vtt or add blocks with "Caption".',
  '{0} blok(ken) op de Ondertitels-track. Staat ook als .srt naast de render.': '{0} block(s) on the Captions track. Also saved as .srt next to the render.',
  'Uit voice-over': 'From voice-over', 'Voeg eerst VO-zinnen toe': 'Add VO lines first', 'Importeer .srt/.vtt': 'Import .srt/.vtt',
  'Ondertitels tonen': 'Show captions', 'Pop': 'Pop', 'Karaoke': 'Karaoke', 'Blok': 'Block', 'Klassiek': 'Classic',
  'Woorden springen er één voor één in, het gesproken woord licht op.': 'Words pop in one by one, the spoken word lights up.',
  'De hele groep staat er, gesproken woorden kleuren mee.': 'The whole group is shown, spoken words light up as they go.',
  'Het gesproken woord krijgt een gekleurd blok (TikTok-stijl).': 'The spoken word gets a colored block (TikTok style).',
  'Rustige ondertitel met achtergrond, hele groep in één keer.': 'Calm caption with a background, the whole group at once.',
  'Grootte (px)': 'Size (px)', 'Woorden per keer': 'Words at a time', 'Hoogte in beeld (Y, px)': 'Height on screen (Y, px)', 'Hoogte in beeld in {0} (Y, px)': 'Height on screen in {0} (Y, px)',
  'Of sleep de ondertitel in de preview. Onder de 1580 px valt hij achter de TikTok-knoppen.': 'Or drag the caption in the preview. Below 1580 px it falls behind the TikTok buttons.',
  'Of sleep de ondertitel in de preview. Onder de 1580 px valt hij achter de TikTok-knoppen. Eigen hoogte in: {0}.': 'Or drag the caption in the preview. Below 1580 px it falls behind the TikTok buttons. Own height in: {0}.',
  'Eigen hoogte voor {0}.': 'Own height for {0}.', 'Terug naar de 9:16-hoogte': 'Back to the 9:16 height',
  'Volgt 9:16. Sleep de ondertitel in deze preview om hem alleen in {0} te verplaatsen.': 'Follows 9:16. Drag the caption in this preview to move it in {0} only.',
  'HOOFDLETTERS': 'CAPITALS', 'Zwarte rand': 'Black outline', 'Markering': 'Highlight', 'Tekst op blok': 'Text on block',
  'Maak merkstandaard': 'Make brand default', 'Terug naar merkstijl': 'Back to brand style',
  'Alle video\'s van {0} krijgen deze stijl, tenzij ze zelf iets anders instellen': 'Every video of {0} gets this style, unless it sets something else',
  'Ondertitelstijl opgeslagen voor merk {0}': 'Caption style saved for brand {0}',
  'Ondertitels gemaakt uit de voice-over.': 'Captions made from the voice-over.',
  'Ondertitels gemaakt. {0} zin(nen) zijn nog niet ingesproken; hun lengte is geschat.': 'Captions made. {0} line(s) aren\'t spoken yet; their length is estimated.',
  'Geen ondertitels gevonden in dit bestand.': 'No captions found in this file.', 'De {0} bestaande ondertitels vervangen?': 'Replace the {0} existing captions?',
  'De {0} bestaande ondertitels vervangen door de voice-over zinnen?': 'Replace the {0} existing captions with the voice-over lines?',
  '{0} ondertitels geïmporteerd': '{0} captions imported', '{0} ondertitels geïmporteerd ({1} lopen door na de eindkaart en worden afgekapt)': '{0} captions imported ({1} run past the end card and are cut off)',
  'Zet de playhead in een clip of ondertitel om te splitsen.': 'Put the playhead in a clip or caption to split it.', 'Dit blok heeft maar één woord.': 'This block has only one word.',
  'Nieuwe ondertitel': 'New caption', 'Nieuwe *tekst.*': 'New *text.*', 'Callout tekst': 'Callout text', 'Label': 'Label', 'Nieuwe zin voor de voice-over.': 'New line for the voice-over.',

  // ---------- brand ----------
  'Geldt voor alle video\'s met merk "{0}". Bestand: brands/{1}.json': 'Applies to every video with brand "{0}". File: brands/{1}.json',
  'Terug naar video': 'Back to video', 'Naam (eindkaart en bovenregel)': 'Name (end card and overline)', 'Website / url': 'Website / url', 'Taal': 'Language',
  'Engels': 'English', 'Nederlands': 'Dutch', 'Duits': 'German', 'Frans': 'French', 'Spaans': 'Spanish', 'Logo': 'Logo', 'Lettertype': 'Font',
  'SVG met fill="currentColor" krijgt automatisch de logo-kleur.': 'An SVG with fill="currentColor" gets the logo color automatically.',
  'Kleuren': 'Colors', 'Achtergrond': 'Background', 'Accent': 'Accent', 'Tekst op accent': 'Text on accent', 'Logo-vlak': 'Logo tile', 'Logo-kleur': 'Logo color',
  'Gloed': 'Glow', 'Gloed 2': 'Glow 2', 'Ring': 'Ring', 'Ring 2': 'Ring 2', 'Apparaat-gloed': 'Device glow', 'Apparaat-rand': 'Device edge', 'Callout-kleuren': 'Callout colors',
  'Grootte naam (px)': 'Name size (px)', 'Knoppen onder de slogan (icoon + tekst, leeg = weg):': 'Buttons under the tagline (icon + text, empty = none):', 'icoon': 'icon',
  'Geavanceerd': 'Advanced', 'Bestandsnaam-voorvoegsel voor renders': 'File name prefix for renders', 'Extra CSS (voor bijzondere aanpassingen)': 'Extra CSS (for special tweaks)',
  'Kopie als nieuw merk': 'Copy as new brand', 'Nieuw merk': 'New brand', 'Maak standaard': 'Make default', 'Merk opslaan…': 'Saving brand…',
  'Logo-bestand {0} verwijderen': 'Delete logo file {0}', 'Lettertype {0} verwijderen': 'Delete font {0}', 'Merk "{0}" aangemaakt': 'Brand "{0}" created',
  'Naam (zoals op de eindkaart)': 'Name (as on the end card)', 'Id (bestandsnaam)': 'Id (file name)',
  'Kleine letters, cijfers en streepjes. Wordt ingevuld op basis van de naam.': 'Lowercase letters, digits and dashes. Filled in from the name.',
  'Leeg startmerk': 'Empty starter brand', 'Kopie van {0}': 'Copy of {0}',

  // ---------- dialogs ----------
  'Naam (id)': 'Name (id)', 'Kleine letters, cijfers en streepjes. Wordt ook de bestandsnaam van de render.': 'Lowercase letters, digits and dashes. Also becomes the file name of the render.',
  'Begin vanaf': 'Start from', 'Leeg sjabloon': 'Empty template', 'Annuleren': 'Cancel', 'Aanmaken': 'Create', 'Renderen': 'Rendering', 'Start renderen': 'Render', 'Sluiten': 'Close',
  'Projecten': 'Projects', 'Een project is een map met eigen merken, video\'s, clips en renders.': 'A project is a folder with its own brands, videos, clips and renders.',
  'Map openen…': 'Open folder…', 'Nieuw project…': 'New project…', 'Naam': 'Name', 'Map': 'Folder', 'Kies…': 'Choose…', 'Nog geen recente projecten.': 'No recent projects yet.',
  'Mijn app TikToks': 'My app TikToks', 'Kies eerst een map.': 'Choose a folder first.', 'Project geopend: {0}': 'Project opened: {0}',
  'Kies een projectmap': 'Choose a project folder', 'Kies of maak een lege map voor het nieuwe project': 'Choose or make an empty folder for the new project',
  'Kies een map': 'Choose a folder', 'Kies python.exe': 'Choose python.exe', '{0}\nVolledig pad naar de map:': '{0}\nFull path to the folder:',
  'Instellingen': 'Settings', 'HyperFrames-versie (voor render en Engelse TTS)': 'HyperFrames version (for rendering and English TTS)',
  'Python met Kokoro/Piper (TTS)': 'Python with Kokoro/Piper (TTS)', 'Map met Piper-stemmen (.onnx)': 'Folder with Piper voices (.onnx)',
  'Renders ook naar Downloads kopiëren': 'Also copy renders to Downloads', 'Opslaan': 'Save', 'Instellingen opgeslagen': 'Settings saved',
  'Taal van de interface': 'Interface language', 'Automatisch': 'Automatic',
  'pad naar python.exe': 'path to python.exe', 'map met .onnx stemmen': 'folder with .onnx voices',
  'Nu gebruikt: Python {0} · Piper-stemmen {1}. Laat leeg voor automatisch.': 'In use now: Python {0} · Piper voices {1}. Leave empty for automatic.',
  'Meerdere video\'s renderen': 'Render several videos', 'Alles': 'All', 'Niets': 'None',
  'Rendert de gekozen video\'s na elkaar, elk in de formaten die bij die video zijn aangevinkt. Je kunt dit venster sluiten; het renderen gaat door.':
    'Renders the chosen videos one after another, each in the formats ticked for that video. You can close this window; rendering carries on.',
  'Kies minstens één video.': 'Choose at least one video.', '{0} video(\'s) renderen': 'Render {0} video(s)', 'Renderen: {0}': 'Rendering: {0}',
  'Bezig': 'Running', 'Klaar': 'Done', 'Mislukt': 'Failed', 'Gestopt': 'Stopped', 'Gestopt.': 'Stopped.', 'Stoppen': 'Stop', 'Map openen': 'Open folder', 'Log': 'Log',
  'Formaat {0} van {1}': 'Format {0} of {1}', 'Video {0} van {1}': 'Video {0} of {1}', 'formaat {0} van {1}': 'format {0} of {1}',
  'nog ~{0}': '~{0} left', '{0} verstreken': '{0} elapsed', 'Elke video in zijn eigen formaten': 'Each video in its own formats',
  'Rendertijd': 'Render time', 'Totaal': 'Total', 'Bestanden': 'Files', 'Bekijken': 'Watch', 'Downloaden': 'Download', 'Ondertitels (.srt)': 'Captions (.srt)',
  'In renders/ en in Downloads.': 'In renders/ and in Downloads.', 'In de map renders/ van dit project.': 'In this project\'s renders/ folder.',
  'Renderen mislukt. Het log hieronder laat zien waar het misging.': 'Rendering failed. The log below shows where it went wrong.',
  'Klaar. {0} is nu het audiospoor. De lengte van elke zin staat op de tijdlijn. De ondertitels zijn er meteen bij gemaakt.': 'Done. {0} is now the audio track. The length of every line is on the timeline. The captions were made right away.',
  'Klaar. {0} is nu het audiospoor. De lengte van elke zin staat op de tijdlijn. Klik op "Uit voice-over" om de ondertitels bij te werken.': 'Done. {0} is now the audio track. The length of every line is on the timeline. Click "From voice-over" to update the captions.',
  'Sneltoetsen': 'Keyboard shortcuts', 'Zoeken…': 'Search…',

  // shortcuts dialog
  'Afspelen / pauzeren': 'Play / pause', '1 frame terug / verder': '1 frame back / forward', '1 seconde terug / verder': '1 second back / forward', 'Naar begin / einde': 'Go to start / end',
  'Splitsen op playhead (clip of ondertitel)': 'Split at playhead (clip or caption)', 'Geselecteerd item verwijderen': 'Delete selected item',
  'Clip verwijderen, de clips erna schuiven aan': 'Delete a clip and pull the clips after it back', 'Selectie 1 frame verschuiven (Shift: 10; ook Alt+← / →)': 'Nudge the selection 1 frame (Shift: 10; also Alt+← / →)',
  'Tijdens slepen: niet snappen': 'While dragging: no snapping', 'Hele video in de tijdlijn passen': 'Fit the whole video in the timeline', 'Ongedaan maken / opnieuw': 'Undo / redo',
  'Kopiëren / knippen / plakken op playhead (ook tussen video\'s)': 'Copy / cut / paste at playhead (also between videos)', 'Meer items selecteren': 'Select more items',
  'Ctrl+klik': 'Ctrl+click', 'Marker op playhead (nog eens = weg)': 'Marker at playhead (again = remove)', 'Naar vorige / volgende marker of beat': 'Go to previous / next marker or beat',
  'Tijdlijn in-/uitzoomen': 'Zoom timeline in / out', 'Alt of F10': 'Alt or F10', 'Menubalk': 'Menu bar', 'Nieuwe video': 'New video', 'Projecten': 'Projects', 'Batch renderen': 'Batch render',
  'Tik-modus (klik = tik)': 'Tap mode (click = tap)', 'Tik-modus aan/uit': 'Tap mode on/off',

  // video list
  '{0} dupliceren': 'Duplicate {0}', '{0} verwijderen': 'Delete {0}',

  // ---------- toasts and confirmations ----------
  'Video "{0}" verwijderen?\nHet bestand gaat naar specs/.trash, dus je kunt het nog terugzetten. Renders blijven staan.': 'Delete video "{0}"?\nThe file goes to specs/.trash, so you can still restore it. Renders stay.',
  'Video {0} verwijderd': 'Video {0} deleted',
  '"{0}" verwijderen?': 'Delete "{0}"?', 'Het wordt nergens gebruikt.': 'It isn\'t used anywhere.',
  'Het bestand gaat naar een .trash-map in het project, dus je kunt het nog terugzetten.': 'The file goes to a .trash folder in the project, so you can still restore it.',
  'De clip verdwijnt uit: {0}.': 'The clip is removed from: {0}.', 'Het spoor verdwijnt uit: {0}.': 'The track is removed from: {0}.', 'Het logo verdwijnt uit: {0}.': 'The logo is removed from: {0}.',
  'Het lettertype valt terug op het standaardlettertype in: {0}.': 'The font falls back to the default font in: {0}.', 'video {0}': 'video {0}', 'merk {0}': 'brand {0}',
  '{0} verwijderd': '{0} deleted', '{0} verwijderd (uit {1})': '{0} deleted (from {1})',
  'Selecteer eerst iets om te kopiëren (Ctrl+klik voor meer items, Ctrl+A voor alles).': 'Select something to copy first (Ctrl+click for more items, Ctrl+A for everything).',
  '{0} item gekopieerd. Plak met Ctrl+V op de playhead, of Ctrl+Shift+V op dezelfde tijd.': '{0} item copied. Paste with Ctrl+V at the playhead, or Ctrl+Shift+V at the same time.',
  '{0} items gekopieerd. Plak met Ctrl+V op de playhead, of Ctrl+Shift+V op dezelfde tijd.': '{0} items copied. Paste with Ctrl+V at the playhead, or Ctrl+Shift+V at the same time.',
  '{0} item geknipt': '{0} item cut', '{0} items geknipt': '{0} items cut', 'Het klembord is leeg.': 'The clipboard is empty.',
  '{0} item geplakt': '{0} item pasted', '{0} items geplakt': '{0} items pasted', '{0} item geplakt uit {1}': '{0} item pasted from {1}', '{0} items geplakt uit {1}': '{0} items pasted from {1}',
  '{0} overgeslagen ({1})': '{0} skipped ({1})', '{0} items verwijderd': '{0} items deleted',
  '{0} clip verwijderd, de rest is aangeschoven': '{0} clip deleted, the rest moved up', '{0} clips verwijderd, de rest is aangeschoven': '{0} clips deleted, the rest moved up',
  'Beats gevonden in {0}: {1} beats, ±{2} BPM': 'Beats found in {0}: {1} beats, ±{2} BPM', 'Beats niet gevonden: {0}': 'Beats not found: {0}',
  'Uploaden en omzetten: {0}…': 'Uploading and converting: {0}…', '{0} toegevoegd': '{0} added', 'Upload mislukt: {0}': 'Upload failed: {0}',
  'Kopie van {0}': 'Copy of {0}', 'Nieuwe video': 'New video',
  // ---------- starters ----------
  'Kies een starter. Hij wordt gevuld met de clips van dit project, daarna pas je alles aan.': 'Pick a starter. It is filled with this project\'s clips; then you change whatever you like.',
  'Of kopieer een video': 'Or copy a video', 'Leeg': 'Empty', 'Alleen een kop en je eerste clip.': 'Just a headline and your first clip.',
  'App-lancering': 'App launch', 'Hook, drie punten, twee callouts en een zoom. Voor een nieuwe app of update.': 'Hook, three points, two callouts and a zoom. For a new app or an update.',
  'Uitleg in 3 stappen': 'How-to in 3 steps', 'Een kop per stap, met een tik op het scherm en een marker bij elke stap.': 'A headline per step, with a tap on the screen and a marker at every step.',
  'Voor en na': 'Before and after', 'Twee telefoons naast elkaar: links hoe het was, rechts met jouw app.': 'Two phones side by side: how it was on the left, with your app on the right.',
  'Website-rondleiding': 'Website tour', 'Browservenster met muisklikken en twee zooms. Voor web-apps en landingspagina\'s.': 'Browser window with mouse clicks and two zooms. For web apps and landing pages.',
  'Snelle tip': 'Quick tip', 'Beeldvullend met grote ondertitels. Voor een korte tip of een how-to zonder apparaat.': 'Full screen with big captions. For a short tip or a how-to without a device.'
};

export const tables = { en };
let exact = null, patterns = [];

// The server bakes the chosen language into the page (<html data-ui-lang>), so the first paint is already right.
export const lang = (() => { const l = document.documentElement.dataset.uiLang; return tables[l] ? l : 'nl'; })();

function compile(table) {
  exact = new Map();
  for (const [k, v] of Object.entries(table)) {
    if (!/\{\d+\}/.test(k)) { exact.set(k, v); continue; }
    const re = new RegExp('^' + k.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\d+)\}/g, '(?<g$1>.+?)') + '$', 's');
    patterns.push([re, v, k.replace(/\{\d+\}/g, '').length]);
  }
  patterns.sort((a, b) => b[2] - a[2]); // most specific first
}
if (lang !== 'nl') compile(tables[lang]);

// Translates one piece of text; whitespace around it is kept. Untranslated text comes back unchanged.
export function tr(text, depth = 0) {
  if (!exact || typeof text !== 'string') return text;
  const core = text.trim();
  if (!core || depth > 3) return text;
  let out = exact.get(core);
  if (out == null) {
    for (const [re, val] of patterns) {
      const m = re.exec(core);
      if (m) { out = val.replace(/\{(\d+)\}/g, (_, i) => tr(m.groups['g' + i], depth + 1)); break; }
    }
  }
  if (out == null && core.includes('\n')) { const lines = core.split('\n').map(l => tr(l, depth + 1)); if (lines.join('\n') !== core) out = lines.join('\n'); }
  // Joined pieces ("a · b", "a, b"): translate each piece.
  for (const sep of [' · ', ', ']) {
    if (out != null || !core.includes(sep)) continue;
    const parts = core.split(sep).map(l => tr(l, depth + 1)).join(sep);
    if (parts !== core) out = parts;
  }
  return out == null ? text : text.match(/^\s*/)[0] + out + text.match(/\s*$/)[0];
}

// User content that must never be translated (names, file names, typed text, the timeline's item labels).
const SKIP = 'script, style, textarea, .lbl, .no-i18n, #project-name, .dd[data-for="video-select"] .dd-label, .clip-meta .nm, .audio-item .name, .recent, .batch-row b, .batch-row span, .chip-demo, #job-log, #tl-ruler';
const ATTRS = ['title', 'placeholder', 'aria-label'];
function translateNode(n) {
  if (n.nodeType === 3) {
    if (n.parentElement?.closest(SKIP)) return;
    const t = tr(n.data); if (t !== n.data) n.data = t;
  } else if (n.nodeType === 1) {
    if (n.closest(SKIP)) return;
    for (const a of ATTRS) if (n.hasAttribute(a)) { const v = n.getAttribute(a), t = tr(v); if (t !== v) n.setAttribute(a, t); }
    for (const c of n.childNodes) translateNode(c);
  }
}

// Translates the page now and everything added or changed later; confirm()/prompt() messages too.
export function installTranslations() {
  if (!exact) return;
  document.title = tr(document.title);
  translateNode(document.body);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(translateNode);
      else if (m.type === 'characterData') translateNode(m.target);
      else if (m.type === 'attributes' && !m.target.closest(SKIP)) {
        const v = m.target.getAttribute(m.attributeName), t = tr(v);
        if (v != null && t !== v) m.target.setAttribute(m.attributeName, t);
      }
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const confirm0 = window.confirm.bind(window), prompt0 = window.prompt.bind(window);
  window.confirm = msg => confirm0(tr(String(msg)));
  window.prompt = (msg, def) => prompt0(tr(String(msg)), def);
}
