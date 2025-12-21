<template>
  <div v-if="showOverlay" class="fixed inset-0 z-50 font-sans overflow-hidden animate-fade-in">
    
    <!-- Combat Request Dialog (Preserved from original) -->
    <div v-if="isPending" class="absolute inset-0 z-50 flex items-center justify-center bg-stone-900/80 backdrop-blur-sm">
      <div class="relative max-w-md w-full rounded-xl overflow-hidden shadow-2xl animate-scale-in group">
         <!-- Background & Texture -->
         <div class="absolute inset-0 bg-stone-100 dark:bg-stone-900"></div>
         <div class="absolute inset-0 opacity-40 bg-texture-rice-paper"></div>
         <div class="absolute inset-0 opacity-10 bg-texture-stardust animate-pulse-slow"></div>
         
         <!-- Content -->
         <div class="relative z-10 p-8 text-center">
           <h2 class="text-3xl font-bold font-display text-touhou-red mb-6 tracking-wider flex items-center justify-center gap-3">
             <span class="animate-bounce">⚠</span> 
             <span class="drop-shadow-sm">战斗遭遇</span> 
             <span class="animate-bounce">⚠</span>
           </h2>
           
           <div class="mb-8 p-4 bg-stone-200/50 dark:bg-stone-800/50 rounded-lg border border-izakaya-wood/20 backdrop-blur-sm">
             <p class="text-izakaya-wood dark:text-stone-300 mb-2 font-serif text-lg">
               遭遇敌人
             </p>
             <div class="text-2xl font-bold text-touhou-red font-display mb-4">{{ enemyNames }}</div>
             <p class="text-sm text-izakaya-wood/70 dark:text-stone-500 italic">
               "是否展开弹幕结界进行迎击？"
             </p>
           </div>

           <div class="flex justify-center gap-4">
              <button @click="startCombat" 
                class="group relative px-8 py-3 bg-touhou-red hover:bg-red-700 text-white rounded-lg font-bold font-display shadow-lg hover:shadow-touhou-red/40 transform hover:-translate-y-0.5 transition-all overflow-hidden">
                <div class="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span class="relative flex items-center gap-2">
                  <span>⚔️</span> 符卡展开
                </span>
              </button>
              
              <button @click="skipCombat" 
                class="group px-8 py-3 bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-izakaya-wood dark:text-stone-200 rounded-lg font-bold font-display shadow transition-all flex items-center gap-2">
                <span>🕊️</span> 
                <span>避战</span>
              </button>
           </div>
         </div>
         
         <!-- Decorative Borders -->
         <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-touhou-red to-transparent opacity-50"></div>
         <div class="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-touhou-red to-transparent opacity-50"></div>
      </div>
    </div>

    <!-- Main Combat Container (Sandbox Style) -->
    <div v-else-if="isActive" class="absolute inset-0 bg-black text-white font-sans overflow-hidden">
      <!-- Dynamic Background Layer -->
      <div class="absolute inset-0 z-0 overflow-hidden">
         <!-- The Image -->
         <img :src="currentBackground" class="w-full h-full object-cover opacity-50 mix-blend-normal blur-[1px] scale-105" />
         <!-- P5 Style Overlay Pattern -->
         <div class="absolute inset-0 bg-texture-stardust opacity-10 mix-blend-multiply"></div>
         <div class="absolute inset-0 bg-gradient-to-br from-red-900/40 via-black/60 to-black/80 mix-blend-multiply"></div>
      </div>

      <!-- Combat Intro Animation (VS Screen) -->
      <transition name="intro-fade">
        <div v-if="showIntro" class="fixed inset-0 z-[100] bg-black overflow-hidden flex items-center justify-center font-display pointer-events-none">
           <!-- Background Split -->
           <div class="absolute inset-0 bg-white clip-split-left animate-bg-slide-left z-0"></div>
           <div class="absolute inset-0 bg-red-600 clip-split-right animate-bg-slide-right z-0"></div>
           
           <!-- Halftone Pattern Overlay -->
           <div class="absolute inset-0 bg-texture-stardust opacity-20 mix-blend-multiply z-10"></div>
           
           <!-- Player Side (Left) -->
          <div class="absolute left-0 bottom-0 h-full w-1/2 flex items-end justify-start z-20">
             <div class="relative w-full h-full animate-char-slide-left">
                <!-- Character Sprite -->
                <img 
                  :src="getSpriteUrl('主角')" 
                  @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                  class="absolute bottom-0 left-[-10%] h-[110%] object-cover object-top drop-shadow-2xl brightness-0 contrast-100 grayscale transform skew-x-[-10deg] scale-110"
                />
                <!-- Name -->
                <div class="absolute bottom-1/3 left-10 text-8xl font-black italic text-black tracking-tighter drop-shadow-white rotate-[-5deg]">
                  <span class="block text-4xl text-red-600 mb-2">PLAYER</span>
                  {{ player?.name || 'Reimu' }}
                </div>
             </div>
          </div>

           <!-- Enemy Side (Right) -->
           <div class="absolute right-0 top-0 h-full w-1/2 flex items-start justify-end z-20">
              <div class="relative w-full h-full animate-char-slide-right transform-gpu will-change-transform">
                 <!-- Character Sprite -->
                 <img 
                   :src="getSpriteUrl(enemies[0]?.name)" 
                   @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                   class="absolute bottom-0 right-[-10%] h-[110%] w-auto object-cover object-top drop-shadow-2xl brightness-0 contrast-100 grayscale transform skew-x-[-10deg] scale-110 transform-gpu" 
                   style="image-rendering: -webkit-optimize-contrast; backface-visibility: hidden;"
                 />
                 <!-- Name -->
                 <div class="absolute top-1/3 right-10 text-8xl font-black italic text-white tracking-tighter drop-shadow-red rotate-[-5deg] text-right">
                   <span class="block text-4xl text-black mb-2">ENEMY</span>
                   {{ enemies[0]?.name || 'Unknown' }}
                 </div>
              </div>
           </div>

           <!-- VS Logo -->
           <div class="absolute z-50 flex items-center justify-center animate-slam">
              <div class="relative">
                 <span class="text-[15rem] font-black italic text-yellow-400 drop-shadow-[10px_10px_0_rgba(0,0,0,1)] tracking-tighter transform -skew-x-12 rotate-[-10deg] block">
                    VS
                 </span>
                 <div class="absolute inset-0 animate-pulse-fast mix-blend-overlay bg-white/50 skew-x-12"></div>
              </div>
           </div>
           
           <!-- Flash Overlay -->
           <div class="absolute inset-0 bg-white animate-flash-out z-[60] pointer-events-none"></div>
        </div>
      </transition>

      <!-- Ultimate Spell Cut-in Overlay -->
      <transition name="intro-fade">
        <div v-if="showUltimateCutin" class="fixed inset-0 z-[200] overflow-hidden pointer-events-none flex items-center justify-center font-display">
            <!-- Background Flash/Speed Lines -->
            <div class="absolute inset-0 bg-black/80 animate-flash-fade z-0"></div>
            <!-- Speed Lines Effect (CSS only, no texture required) -->
            <div class="absolute inset-0 opacity-30 animate-pulse-fast mix-blend-overlay z-10 radial-speed-lines"></div>
            
            <!-- Character Portrait Slide-in -->
            <div class="absolute h-full w-full flex items-center z-20" :class="ultimateCutinData.isPlayer ? 'justify-start' : 'justify-end'">
                <div class="relative h-full w-2/3 transition-all duration-500" :class="ultimateCutinData.isPlayer ? 'animate-slide-in-left' : 'animate-slide-in-right'">
                    <div class="w-full h-full animate-portrait-move origin-center">
                        <img 
                          :src="ultimateCutinData.spriteUrl" 
                          class="h-full w-full object-cover object-top drop-shadow-[0_0_50px_rgba(255,255,255,0.5)] transform"
                          :class="ultimateCutinData.isPlayer ? 'skew-x-12' : '-skew-x-12 scale-x-[-1]'"
                        />
                         <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent mix-blend-overlay"></div>
                    </div>
                </div>
            </div>

            <!-- Spell Name Text -->
            <div class="absolute z-30 flex flex-col items-center justify-center w-full">
                <div class="text-6xl md:text-8xl font-black italic text-white drop-shadow-[0_0_20px_rgba(255,0,0,1)] tracking-tighter animate-slam font-display transform -rotate-6 border-y-8 border-yellow-400 py-4 bg-black/50 backdrop-blur-md px-20">
                    <span class="block text-3xl text-yellow-400 mb-2 tracking-[1em] text-center uppercase">Spell Card</span>
                    {{ ultimateCutinData.spellName }}
                </div>
                <div class="mt-4 text-3xl text-white font-serif tracking-widest animate-fade-in">
                   {{ ultimateCutinData.charName }}
                </div>
            </div>
        </div>
      </transition>

      <!-- Skill Cut-in (Simple) -->
      <transition enter-active-class="transition duration-300 ease-out" enter-from-class="opacity-0" enter-to-class="opacity-100" leave-active-class="transition duration-200 ease-in" leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="showSkillCutin" class="fixed inset-0 z-[190] pointer-events-none flex flex-col justify-center overflow-hidden font-display">
            <!-- Strip Background -->
            <div class="absolute w-full h-40 md:h-56 bg-black/60 backdrop-blur-sm border-y-4 border-white/20 flex items-center animate-slide-in-fast origin-left"
                 :class="skillCutinData.isPlayer ? 'bg-gradient-to-r from-blue-900/90 to-transparent' : 'bg-gradient-to-l from-red-900/90 to-transparent'">
                 
                 <!-- Sprite (masked) -->
                 <div class="absolute top-[-50%] h-[200%] w-1/2 md:w-1/3 opacity-90 mix-blend-normal"
                      :class="skillCutinData.isPlayer ? 'left-0 md:left-20 animate-slide-in-left' : 'right-0 md:right-20 animate-slide-in-right'">
                     <img :src="skillCutinData.spriteUrl" class="h-full w-full object-cover object-top mask-image-fade-bottom" />
                 </div>
        
                 <!-- Text -->
                 <div class="w-full px-10 md:px-32 flex flex-col justify-center relative z-10" :class="skillCutinData.isPlayer ? 'items-end text-right' : 'items-start text-left'">
                     <div class="text-4xl md:text-6xl text-white font-black italic drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] animate-fade-in-up">{{ skillCutinData.spellName }}</div>
                     <div class="text-xl md:text-2xl text-white/80 font-serif mt-1 tracking-widest">{{ skillCutinData.charName }}</div>
                 </div>
            </div>
        </div>
      </transition>

      <!-- Layer 0: Background -->
      <div class="absolute inset-0 bg-gradient-to-br from-red-900/20 via-black to-blue-900/20 z-0">
        <div class="absolute inset-0 bg-texture-stardust opacity-10 mix-blend-overlay"></div>
        <!-- Dynamic Lines/Patterns -->
        <div class="absolute inset-0 overflow-hidden">
           <div class="absolute -left-20 top-1/2 w-[200%] h-40 bg-red-600/20 -rotate-12 blur-3xl transform-gpu animate-pulse"></div>
           <div class="absolute -right-20 top-1/4 w-[200%] h-20 bg-blue-600/10 rotate-12 blur-2xl transform-gpu"></div>
        </div>
      </div>

      <!-- Layer 1: Battlefield (Characters) -->
      <div class="absolute inset-0 z-10 overflow-hidden pointer-events-none transition-transform duration-100" :class="{ 'animate-shake': isScreenShaking }">
        
        <!-- Effect Overlay -->
        <!-- 1. Point-based Effects (Slash / Enemy Hit / Talk / Hit) -->
        <div v-if="activeEffect.show && !['spell', 'ultimate_impact'].includes(activeEffect.type)" 
             class="absolute z-[60] pointer-events-none flex items-center justify-center"
             :style="{ left: activeEffect.x + 'px', top: activeEffect.y + 'px' }"
        >
            <!-- Slash Effect (Combo) -->
            <div v-if="activeEffect.type === 'slash'" class="relative w-[300px] h-[300px]">
                <div class="absolute inset-0 bg-white clip-shard-diag-1 animate-slash-combo-1 mix-blend-overlay"></div>
                <div class="absolute inset-0 bg-blue-100 clip-shard-diag-2 animate-slash-combo-2 mix-blend-screen"></div>
                <div class="absolute inset-0 bg-white clip-rect-left animate-slash-combo-3 mix-blend-overlay"></div>
            </div>

            <!-- Enemy Hit Effect (Spark) - P5 Style -->
            <div v-if="activeEffect.type === 'enemy' || activeEffect.type === 'hit'" class="w-[300px] h-[300px] flex items-center justify-center">
               <!-- 1. Background Black/Red Flash -->
               <div class="absolute w-[120%] h-[120%] bg-black clip-starburst animate-flash-fade opacity-80"></div>
               <!-- 2. Core Yellow Spark -->
               <div class="absolute w-full h-full bg-yellow-300 clip-starburst animate-hit-spark mix-blend-screen drop-shadow-[0_0_10px_rgba(255,255,0,0.8)]"></div>
               <!-- 3. Red Inner jagged -->
               <div class="absolute w-[80%] h-[80%] bg-red-600 clip-jagged-slash-2 animate-hit-spark mix-blend-multiply delay-75"></div>
               <!-- 4. Expanding Ring (Jagged) -->
               <div class="absolute w-[150%] h-[150%] border-[10px] border-white clip-starburst animate-ping-slow opacity-80"></div>
            </div>

            <!-- Talk Effect (Word Projectile) -->
            <div v-if="activeEffect.type === 'talk'" class="relative flex items-center justify-center w-[800px] pointer-events-none">
                <div class="text-7xl md:text-9xl font-black italic text-white drop-shadow-[0_0_20px_rgba(255,0,0,0.8)] animate-word-projectile whitespace-nowrap transform -rotate-12 border-y-4 border-white/50 py-2 bg-black/30 backdrop-blur-sm">
                   {{ activeEffect.extra || '异议！' }}
                </div>
            </div>
        </div>

        <!-- 2. Fullscreen Spell Effect (Magic Circle) -->
        <div v-if="activeEffect.show && activeEffect.type === 'spell'" class="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none overflow-hidden">
             <!-- Background Dim & Flash -->
             <div class="absolute inset-0 bg-black/40 animate-fade-in-fast backdrop-blur-[2px]"></div>
             
             <!-- Magic Circle Container -->
             <div class="relative w-[min(90vw,90vh)] h-[min(90vw,90vh)] flex items-center justify-center animate-scale-in-elastic">
                
                <!-- Layer 0: Rotating Background Rays -->
                <div class="absolute inset-[-50%] animate-spin-slow opacity-30">
                    <div class="w-full h-full bg-[conic-gradient(from_0deg,transparent_0deg,purple_20deg,transparent_40deg,purple_60deg,transparent_80deg,purple_100deg,transparent_120deg,purple_140deg,transparent_160deg,purple_180deg,transparent_200deg,purple_220deg,transparent_240deg,purple_260deg,transparent_280deg,purple_300deg,transparent_320deg,purple_340deg,transparent_360deg)] opacity-20 mix-blend-screen"></div>
                </div>

                <!-- Layer 1: Outer Runes Ring -->
                <div class="absolute w-full h-full border-[2px] border-purple-500/40 rounded-full animate-spin-slow shadow-[0_0_30px_rgba(168,85,247,0.3)]">
                    <div class="absolute inset-2 border border-dashed border-purple-300/30 rounded-full"></div>
                    <!-- Cardinal Points Decor -->
                    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 bg-purple-500 rotate-45 border-4 border-white shadow-[0_0_20px_white]"></div>
                    <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 bg-purple-500 rotate-45 border-4 border-white shadow-[0_0_20px_white]"></div>
                    <div class="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-purple-500 rotate-45 border-4 border-white shadow-[0_0_20px_white]"></div>
                    <div class="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 bg-purple-500 rotate-45 border-4 border-white shadow-[0_0_20px_white]"></div>
                </div>

                <!-- Layer 2: Middle Geometry (Hexagram Simulation) -->
                <div class="absolute w-[75%] h-[75%] animate-spin-reverse-slow">
                     <div class="absolute inset-0 border-[6px] border-purple-400/60 rounded-full"></div>
                     <!-- Triangle 1 -->
                     <div class="absolute inset-0 border-[3px] border-purple-200/50 rotate-0 clip-triangle"></div>
                     <!-- Triangle 2 -->
                     <div class="absolute inset-0 border-[3px] border-purple-200/50 rotate-180 clip-triangle"></div>
                     
                     <div class="absolute inset-[15%] border-4 border-dotted border-white/40 rounded-full"></div>
                </div>

                <!-- Layer 3: Inner Core Ring -->
                <div class="absolute w-[40%] h-[40%] border-[8px] border-white/90 rounded-full animate-spin shadow-[0_0_50px_#d8b4fe]">
                    <div class="absolute inset-0 border-t-[8px] border-t-purple-600 rounded-full"></div>
                </div>
                
                <!-- Layer 4: Central Energy Blast -->
                <div class="absolute w-[10%] h-[10%] bg-white rounded-full animate-pulse shadow-[0_0_80px_#fff,0_0_120px_#a855f7]"></div>
                
                <!-- Layer 5: Expanding Shockwaves -->
                <div class="absolute inset-0 border-[2px] border-purple-100 rounded-full animate-ping-slow opacity-60"></div>
                <div class="absolute inset-[20%] border-[20px] border-purple-500/10 rounded-full animate-pulse"></div>
                
                <!-- Layer 6: Cross Beams -->
                <div class="absolute w-[150%] h-[4px] bg-gradient-to-r from-transparent via-white to-transparent rotate-45 animate-pulse opacity-80"></div>
                <div class="absolute w-[150%] h-[4px] bg-gradient-to-r from-transparent via-white to-transparent -rotate-45 animate-pulse delay-75 opacity-80"></div>
            </div>
            
            <!-- Extra Particles -->
            <div class="absolute inset-0 bg-texture-stardust opacity-50 animate-pulse mix-blend-screen pointer-events-none"></div>
        </div>
        
        <!-- 3. Ultimate Impact (Fullscreen Beam) -->
        <div v-if="activeEffect.show && activeEffect.type === 'ultimate_impact'" class="fixed inset-0 z-[250] flex items-center justify-center pointer-events-none overflow-hidden">
             <!-- Flash -->
             <div class="absolute inset-0 bg-white animate-flash-fade"></div>
             
             <!-- Beam -->
             <div class="absolute w-full h-[50vh] bg-gradient-to-r from-yellow-200 via-white to-yellow-200 mix-blend-overlay animate-beam-expand blur-xl"></div>
             <div class="absolute w-full h-[20vh] bg-white animate-beam-expand shadow-[0_0_100px_rgba(255,255,255,0.8)]"></div>
             
             <!-- Shatter Overlay -->
             <div class="absolute inset-0 border-[50px] border-white/50 animate-ping-slow"></div>
             
             <!-- Screen Distortion -->
             <div class="absolute inset-0 backdrop-blur-[2px] animate-screen-shatter"></div>
        </div>

        <!-- Player Side (Bottom Left) -->
        <div class="absolute bottom-0 left-0 w-[45%] h-[70%] flex flex-col justify-end items-start pl-10 pb-10">
          <div class="relative group w-full h-full flex flex-col justify-end items-center transition-all duration-500 hover:scale-105 transform translate-y-10 -translate-x-10">
              <!-- Character Sprite Placeholder -->
              <div class="relative w-full h-full flex items-end justify-center pointer-events-auto">
                 <!-- Alive State -->
                 <div v-if="player && player.hp > 0" class="w-80 h-[500px] relative animate-float transform skew-x-[-5deg]">
                    <!-- 1. Card Base (Background & Border) -->
                    <div class="absolute inset-0 rounded-t-3xl overflow-hidden backdrop-blur-sm border-b-4 border-red-500 shadow-[0_0_50px_rgba(220,38,38,0.3)] bg-gradient-to-t from-red-900/40 to-transparent z-0">
                    </div>

                    <!-- 2. Character Sprite (Popping out) -->
                    <div class="absolute -bottom-0 -left-12 w-[130%] h-[115%] z-10 pointer-events-none flex items-end">
                       <img 
                          :src="getSpriteUrl('主角')" 
                          @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                          class="w-full h-full object-cover object-top drop-shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]" 
                          alt="Player" 
                       />
                    </div>

                    <!-- 3. Overlay & Text (Clipped to Card Shape) -->
                    <div class="absolute inset-0 rounded-t-3xl overflow-hidden z-20 pointer-events-none">
                       <div class="absolute inset-0 bg-gradient-to-t from-red-600/60 to-transparent mix-blend-overlay"></div>
                       <span class="absolute bottom-10 left-0 w-full text-center text-5xl font-bold font-display text-white drop-shadow-[0_0_10px_rgba(255,0,0,0.8)] tracking-widest">
                         {{ player?.name }}
                       </span>
                    </div>
                 </div>

                 <!-- Dead State (Shattered) -->
                 <div v-else-if="player" class="w-80 h-[500px] relative transform skew-x-[-5deg] pointer-events-none">
                     <!-- Shard 1 -->
                     <div class="absolute inset-0 w-full h-full rounded-t-3xl backdrop-blur-sm border-b-4 border-red-500 animate-shatter-1 overflow-hidden" 
                          style="clip-path: polygon(0 0, 100% 0, 60% 100%, 0% 80%);">
                        <div class="absolute -bottom-0 -left-12 w-[130%] h-[115%] flex items-end">
                            <img 
                                :src="getSpriteUrl('主角')" 
                                @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                                class="w-full h-full object-cover object-top" 
                            />
                        </div>
                        <div class="absolute inset-0 bg-gradient-to-t from-red-600/60 to-transparent mix-blend-overlay"></div>
                        <span class="absolute bottom-10 left-0 w-full text-center text-5xl font-bold font-display text-white drop-shadow-[0_0_10px_rgba(255,0,0,0.8)] tracking-widest">
                          {{ player?.name }}
                        </span>
                     </div>
                     <!-- Shard 2 -->
                     <div class="absolute inset-0 w-full h-full rounded-t-3xl backdrop-blur-sm border-b-4 border-red-500 animate-shatter-2 overflow-hidden" 
                          style="clip-path: polygon(100% 0, 100% 100%, 0% 100%, 60% 100%, 0% 80%);">
                        <div class="absolute -bottom-0 -left-12 w-[130%] h-[115%] flex items-end">
                            <img 
                                :src="getSpriteUrl('主角')" 
                                @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                                class="w-full h-full object-cover object-top" 
                            />
                        </div>
                        <div class="absolute inset-0 bg-gradient-to-t from-red-600/60 to-transparent mix-blend-overlay"></div>
                     </div>
                 </div>
                 
                 <!-- Damage Popup for Player -->
                 <div v-for="p in player?.popups" :key="p.id" 
                      class="absolute top-1/3 left-1/2 transform -translate-x-1/2 z-50 text-6xl font-black italic font-display animate-damage-pop pointer-events-none whitespace-nowrap"
                      :class="{
                         'text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]': p.type === 'heal',
                         'text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]': p.type === 'buff',
                         'text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]': p.type === 'damage' || p.type === 'crit'
                      }"
                 >
                   {{ p.text }}
                 </div>
              </div>
              
              <!-- Player Status HUD -->
              <div v-if="player" class="absolute -right-20 top-1/2 flex flex-col gap-3 transform skew-x-[-10deg] pointer-events-auto">
                 <!-- HP Bar Wrapper -->
                 <div class="relative transition-transform hover:scale-110 group">
                    <div 
                      class="bg-black/80 border-l-8 pl-6 pr-10 py-3 text-3xl font-bold font-mono clip-hud-left relative"
                      :style="getPlayerHpStyle(player.hp, player.maxHp)"
                    >
                      HP <span class="text-white">{{ player.hp }}</span> <span class="text-sm text-gray-400">/ {{ player.maxHp }}</span>
                      
                      <!-- Shield Indicator -->
                      <div v-if="player.shield > 0" class="absolute -top-6 right-0 text-cyan-400 text-lg font-bold flex items-center gap-1 drop-shadow-md animate-pulse">
                          <Shield class="w-5 h-5 fill-cyan-400/20" /> {{ player.shield }}
                      </div>
                    </div>
                    
                    <!-- AP Display (Action Points) - Moved to HP top-left -->
                    <div class="absolute -left-2 -top-12 flex gap-2 pointer-events-none transform skew-x-[10deg] z-50">
                        <div 
                            v-for="i in (player.maxActionPoints || 2)" :key="i"
                            class="w-8 h-8 rounded-full border-2 border-white shadow-[0_0_15px_rgba(255,255,255,0.6)] transition-all duration-500"
                            :class="(player.actionPoints !== undefined ? player.actionPoints : 2) >= i 
                                ? 'bg-yellow-300 shadow-[0_0_20px_rgba(253,224,71,1)] scale-110 animate-pulse-slow' 
                                : 'bg-gray-900/80 border-gray-600 opacity-60 scale-90'"
                        ></div>
                    </div>
                 </div>

                 <!-- MP Bar Wrapper -->
                 <div class="relative ml-8 transition-transform hover:scale-110 group">
                   <!-- Background & Text (Clipped) -->
                   <div class="bg-black/80 border-l-8 border-blue-500 pl-6 pr-8 py-2 text-2xl font-bold font-mono text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.4)] clip-hud-left">
                     MP <span class="text-white">{{ player.mp }}</span> <span class="text-sm text-gray-400">/ {{ player.maxMp }}</span>
                   </div>
                 </div>

                 <!-- P Point Gauge (Charging Ring) -->
                 <div class="absolute -left-24 top-0 w-20 h-20 bg-black/80 rounded-full border-2 border-red-500 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.5)] transition-transform hover:scale-110">
                    <svg class="w-full h-full transform -rotate-90 p-1" viewBox="0 0 100 100">
                        <!-- Background -->
                        <circle cx="50" cy="50" r="40" stroke="rgba(255,255,255,0.1)" stroke-width="8" fill="none" />
                        <!-- Progress -->
                        <circle cx="50" cy="50" r="40" stroke="#ef4444" stroke-width="8" fill="none"
                            stroke-linecap="round"
                            :stroke-dasharray="251.2"
                            :stroke-dashoffset="251.2 * (1 - ((player.pPoints || 0) / 100))"
                            class="transition-all duration-500 ease-out"
                        />
                    </svg>
                    <div class="absolute inset-0 flex flex-col items-center justify-center font-bold font-mono">
                        <span class="text-[10px] text-red-400 leading-none">P</span>
                        <span class="text-xl text-white leading-none">{{ (player.pPoints || 0).toFixed(0) }}</span>
                    </div>
                 </div>

                 <!-- New: Shield & Dodge Stats -->
                 <div class="flex gap-2 ml-12">
                     <!-- Shield -->
                     <div class="bg-black/80 border-l-4 border-cyan-400 pl-4 pr-4 py-1 text-lg font-bold font-mono text-cyan-400 clip-hud-left flex items-center gap-2">
                         <Shield class="w-4 h-4" />
                         <span class="text-white">{{ player.shield }}</span>
                     </div>
                     <!-- Dodge -->
                     <div class="bg-black/80 border-l-4 border-green-400 pl-4 pr-4 py-1 text-lg font-bold font-mono text-green-400 clip-hud-left flex items-center gap-2">
                         <Zap class="w-4 h-4" />
                         <span class="text-white">{{ Math.round((player.dodgeRate || 0) * 100) }}%</span>
                     </div>
                 </div>
                 
                 <!-- Buffs -->
                 <div class="flex flex-wrap gap-1 mt-2 ml-16 max-w-[280px] transform skew-x-[10deg] pointer-events-auto min-h-[32px] justify-start">
                    <div v-for="buff in player.buffs" :key="buff.id" class="relative group/buff">
                       <div class="w-8 h-8 rounded bg-black/60 border border-gray-500 flex items-center justify-center text-xs text-white cursor-help overflow-hidden transition-transform hover:scale-110">
                           <span class="scale-75">{{ buff.name.substring(0, 1) }}</span>
                       </div>
                       <!-- Tooltip -->
                       <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-black/90 border border-gray-600 text-white text-xs p-2 rounded pointer-events-none opacity-0 group-hover/buff:opacity-100 transition-opacity z-[100] shadow-xl">
                           <div class="font-bold text-yellow-400 mb-1">{{ buff.name }}</div>
                           <div class="mb-1 text-gray-300 leading-tight">{{ buff.description }}</div>
                           
                           <!-- Effects Detail -->
                           <div v-if="buff.effects && buff.effects.length > 0" class="mt-1 mb-1 border-t border-gray-700 pt-1">
                               <div v-for="(eff, idx) in buff.effects" :key="idx" class="flex justify-between text-gray-400">
                                   <span>{{ getEffectName(eff) }}</span>
                                   <span :class="eff.value > 0 ? 'text-green-400' : 'text-red-400'">
                                       {{ eff.value > 0 ? '+' : '' }}{{ eff.isPercentage ? Math.round(eff.value * 100) + '%' : eff.value }}
                                   </span>
                               </div>
                           </div>

                           <div class="text-blue-400 font-mono text-[10px] text-right">剩余 {{ buff.duration }} 轮</div>
                           </div>
                        </div>
                     </div>

                     <!-- Allies Stack (Parallel Folded Cards) -->
                     <div v-if="allies.length > 0" class="relative mt-2 ml-12 w-[280px] h-[140px] transform skew-x-[10deg] pointer-events-none perspective-[1000px]">
                        <transition-group name="list-complete" tag="div">
                            <div 
                                v-for="(ally, index) in sortedAllies" 
                                :key="ally.id" 
                                class="absolute top-0 left-0 w-full transition-all duration-500 ease-out pointer-events-auto cursor-pointer group/ally"
                                :style="{
                                    zIndex: 100 - index,
                                    transform: `translateY(${index * 18}px) translateZ(${-index * 20}px) scale(${1 - index * 0.04})`,
                                    opacity: index === 0 ? 1 : Math.max(0.3, 0.8 - (index * 0.15)),
                                    filter: index === 0 ? 'none' : 'blur(0.5px) grayscale(30%)'
                                }"
                                @click.stop="activateAlly(ally.id)"
                            >
                                <div 
                                    class="w-full bg-black/90 border-l-4 p-2 flex items-center gap-3 shadow-lg backdrop-blur-md relative"
                                    :class="[
                                        index === 0 ? 'border-blue-500 bg-gradient-to-r from-blue-900/40 to-black' : 'border-gray-600 bg-gray-900/80 hover:border-blue-400 hover:bg-gray-800',
                                        { 'opacity-50 grayscale': ally.hp <= 0 }
                                    ]"
                                >
                                    <!-- Sprite -->
                                    <div class="w-10 h-10 rounded overflow-hidden border bg-blue-900/20 flex-shrink-0 transition-colors duration-300"
                                         :class="index === 0 ? 'border-blue-400' : 'border-gray-600'">
                                            <img :src="getSpriteUrl(ally.name)" @error="(e) => (e.target as HTMLImageElement).src = defaultSprite" class="w-full h-full object-cover object-top" />
                                    </div>
                                    
                                    <!-- Info -->
                                    <div class="flex-1 min-w-0">
                                            <div class="flex justify-between items-center">
                                                <span class="font-bold truncate text-xs transition-colors duration-300" 
                                                      :class="index === 0 ? 'text-white' : 'text-gray-400 group-hover/ally:text-white'">
                                                      {{ ally.name }}
                                                </span>
                                                <span v-if="index === 0" class="text-[10px] text-blue-300 font-mono">{{ ally.hp }}/{{ ally.maxHp }}</span>
                                            </div>
                                            <!-- HP -->
                                            <div class="w-full h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
                                                <div class="h-full transition-all duration-500" 
                                                     :class="ally.hp < ally.maxHp * 0.3 ? 'bg-red-500' : 'bg-blue-500'"
                                                     :style="{ width: `${(ally.hp / ally.maxHp) * 100}%` }">
                                                </div>
                                            </div>
                                    </div>

                                    <!-- Active Indicator (Top Card Only) -->
                                    <div v-if="index === 0" class="absolute -right-1 -top-1 w-3 h-3 bg-blue-400 rounded-full animate-ping"></div>
                                </div>
                                
                                <!-- Buffs Display (Top Card Only) -->
                                <div v-if="index === 0 && ally.buffs && ally.buffs.length > 0" class="flex flex-wrap gap-1 mt-1 pl-2 animate-fade-in relative z-[101]">
                                        <div v-for="buff in ally.buffs" :key="buff.id" class="relative group/buff">
                                            <div class="w-6 h-6 rounded bg-black/80 border border-blue-500 flex items-center justify-center text-[10px] text-white cursor-help overflow-hidden shadow-md hover:scale-110 transition-transform">
                                                <span class="scale-90 font-bold">{{ buff.name.substring(0, 1) }}</span>
                                            </div>
                                            <!-- Tooltip -->
                                            <div class="absolute bottom-full left-0 mb-2 w-40 bg-black/95 border border-blue-500 text-white text-xs p-2 rounded pointer-events-none opacity-0 group-hover/buff:opacity-100 transition-opacity z-[200] shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                                                <div class="font-bold text-yellow-400 mb-1 flex justify-between">
                                                    <span>{{ buff.name }}</span>
                                                </div>
                                                <div class="mb-1 text-gray-300 leading-tight border-b border-gray-700 pb-1">{{ buff.description }}</div>
                                                <div class="text-blue-400 font-mono text-[10px] text-right mt-1">剩余 {{ buff.duration }} 轮</div>
                                            </div>
                                        </div>
                                </div>
            
                                <!-- Damage Popup (All Cards) -->
                                <div v-for="p in ally.popups" :key="p.id" 
                                        class="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-full z-50 text-xl font-black italic font-display animate-damage-pop pointer-events-none whitespace-nowrap"
                                        :style="{ zIndex: 200 }"
                                        :class="{
                                            'text-green-400 drop-shadow-md': p.type === 'heal',
                                            'text-blue-400 drop-shadow-md': p.type === 'buff',
                                            'text-red-500 drop-shadow-md': p.type === 'damage'
                                        }"
                                >
                                    {{ p.text }}
                                </div>
                            </div>
                        </transition-group>
                     </div>
                  </div>
              </div>
        </div>

        <!-- Enemy Side (Top Right) -->
        <div class="absolute top-0 right-0 w-[60%] h-[60%] flex flex-row justify-end items-start pr-10 pt-10 gap-8 pointer-events-none">
           
           <!-- Reserve Enemies (Compact Mode) -->
           <div v-if="reserveEnemies.length > 0" class="flex flex-col gap-2 pt-4 pointer-events-auto mr-4 animate-fade-in">
              <div 
                 v-for="(en) in reserveEnemies" 
                 :key="en.id"
                 @click="selectTarget(en)"
                 class="relative w-48 bg-black/80 border-l-4 border-purple-500 p-3 transform transition-all duration-300 hover:scale-105 hover:bg-purple-900/40 cursor-pointer group"
                 :class="{
                    'opacity-50 cursor-not-allowed': isActing || (phase === 'enemy'),
                    'border-red-500 bg-red-900/20': selectionMode
                 }"
              >
                  <div class="flex justify-between items-center mb-1">
                      <span class="font-bold font-display text-white truncate text-sm">{{ en.name }}</span>
                      <span class="text-xs font-mono text-purple-300">WAITING</span>
                  </div>
                  <!-- HP Bar -->
                  <div class="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div class="h-full bg-purple-500 transition-all duration-500" :style="{ width: `${(en.hp / en.maxHp) * 100}%` }"></div>
                  </div>
                  <div class="text-right text-[10px] font-mono text-gray-400 mt-1">HP {{ en.hp }}</div>

                  <!-- Hover Tooltip/Preview -->
                  <div class="absolute right-full top-0 mr-2 w-20 h-20 hidden group-hover:block z-50 border-2 border-purple-500 rounded bg-black">
                      <img :src="getSpriteUrl(en.name)" class="w-full h-full object-cover object-top" />
                  </div>
              </div>
           </div>

           <!-- Active Enemies (Full Card Mode) -->
           <div 
              v-for="(en, idx) in activeEnemies" 
              :key="en.id"
              @click="selectTarget(en)"
              @mouseenter="hoveredEnemyId = en.id"
              @mouseleave="hoveredEnemyId = null"
              class="relative flex-1 min-w-0 max-w-[220px] h-full flex flex-col justify-start items-center transform transition-all duration-500 pointer-events-auto"
              :class="{ 
                'hover:scale-105': en.hp > 0 && !selectionMode && !isActing,
                'cursor-crosshair hover:scale-105 hover:brightness-125': selectionMode && en.hp > 0 && !isActing,
                'cursor-not-allowed opacity-80': isActing || (phase === 'enemy')
              }"
              :style="{ 
                 transform: `translateY(${idx * 30}px)`,
                 zIndex: hoveredEnemyId === en.id ? 50 : (activeEnemies.length - idx)
              }"
           >
               <!-- Enemy Sprite / Card -->
               <div class="relative w-full h-full flex items-start justify-center animate-float-delayed">
                  <!-- Alive State -->
                  <div v-if="en.hp > 0" 
                       class="w-full h-full relative group"
                       :class="{'grayscale brightness-50': en.hp <= 0}"
                  >
                     <!-- 1. Card Base -->
                     <div class="absolute inset-0 rounded-b-3xl overflow-hidden backdrop-blur-sm border-t-4 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.3)] bg-gradient-to-b from-purple-900/40 to-transparent z-0"></div>

                     <!-- 2. Character Sprite (Pop Out) -->
                     <div class="absolute -top-4 left-0 w-full h-[115%] z-10 pointer-events-none flex items-start justify-center">
                        <img 
                            :src="getSpriteUrl(en.name)" 
                            @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                            class="w-full h-full object-cover object-top drop-shadow-2xl transition-transform duration-500 group-hover:scale-[1.02]" 
                            alt="Enemy" 
                        />
                     </div>

                     <!-- 3. Overlay & Text -->
                     <div class="absolute inset-0 rounded-b-3xl overflow-hidden z-20 pointer-events-none">
                        <div class="absolute inset-0 bg-gradient-to-b from-purple-600/60 to-transparent mix-blend-overlay"></div>
                        <span class="absolute top-10 left-0 w-full text-center text-2xl font-bold font-display text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] tracking-widest px-2 break-words">
                          {{ en.name }}
                        </span>
                     </div>
                  </div>

                  <!-- Dead State (Shattered) -->
                  <div v-else class="absolute inset-0 w-full h-full pointer-events-none">
                     <!-- Shard 1 -->
                   <div class="absolute inset-0 w-full h-full rounded-b-3xl backdrop-blur-sm border-t-4 border-purple-500 animate-shatter-1 overflow-hidden" 
                        style="clip-path: polygon(0 0, 100% 0, 60% 100%, 0% 80%);">
                      <div class="absolute -top-4 left-0 w-full h-[115%] flex items-start justify-center">
                          <img 
                              :src="getSpriteUrl(en.name)" 
                              @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                              class="w-full h-full object-cover object-top" 
                          />
                      </div>
                      <div class="absolute inset-0 bg-gradient-to-b from-purple-600/60 to-transparent mix-blend-overlay"></div>
                      <span class="absolute top-10 left-0 w-full text-center text-2xl font-bold font-display text-white drop-shadow-[0_0_10px_rgba(168,85,247,0.8)] tracking-widest px-2 break-words">
                        {{ en.name }}
                      </span>
                   </div>
                   <!-- Shard 2 -->
                   <div class="absolute inset-0 w-full h-full rounded-b-3xl backdrop-blur-sm border-t-4 border-purple-500 animate-shatter-2 overflow-hidden" 
                        style="clip-path: polygon(100% 0, 100% 100%, 0% 100%, 60% 100%, 0% 80%);">
                      <div class="absolute -top-4 left-0 w-full h-[115%] flex items-start justify-center">
                          <img 
                              :src="getSpriteUrl(en.name)" 
                              @error="(e) => (e.target as HTMLImageElement).src = defaultSprite"
                              class="w-full h-full object-cover object-top" 
                          />
                      </div>
                      <div class="absolute inset-0 bg-gradient-to-b from-purple-600/60 to-transparent mix-blend-overlay"></div>
                   </div>
                  </div>
                  
                  <!-- Damage Popup for Enemy -->
                  <div v-for="p in en.popups" :key="p.id" 
                       class="absolute top-10 left-1/2 transform -translate-x-1/2 z-50 text-5xl font-black italic font-display animate-damage-pop pointer-events-none whitespace-nowrap"
                       :class="{
                          'text-green-400': p.type === 'heal',
                          'text-blue-400 drop-shadow-[0_0_10px_rgba(96,165,250,0.8)]': p.type === 'buff',
                          'text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.8)]': p.type === 'damage' || p.type === 'crit'
                       }"
                  >
                    {{ p.text }}
                  </div>
               </div>
               
               <!-- Enemy Status HUD -->
               <div 
                 class="absolute -left-10 bottom-10 flex flex-col gap-2 transform skew-x-[10deg] items-end w-full transition-all duration-500"
                 :class="en.hp > 0 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10 pointer-events-none'"
               >
                  <div 
                    class="border-r-4 pr-4 pl-6 py-1 text-lg font-bold font-mono clip-hud-right w-full text-right transition-all duration-300"
                    :style="getEnemyHpStyle(en.hp, en.maxHp)"
                  >
                    HP <span class="text-white">{{ en.hp }}</span>
                  </div>

                  <!-- New: Shield & Dodge Stats (Enemy) -->
                  <div class="flex gap-2 justify-end w-full">
                      <!-- Dodge -->
                      <div class="bg-black/80 border-r-4 border-green-400 pr-2 pl-2 py-0.5 text-xs font-bold font-mono text-green-400 clip-hud-right flex items-center gap-1">
                          <span class="text-white">{{ Math.round((getEnemyEffectiveDodge(en) || 0) * 100) }}%</span>
                          <Zap class="w-3 h-3" />
                      </div>
                      <!-- Shield -->
                      <div class="bg-black/80 border-r-4 border-cyan-400 pr-2 pl-2 py-0.5 text-xs font-bold font-mono text-cyan-400 clip-hud-right flex items-center gap-1">
                          <span class="text-white">{{ en.shield || 0 }}</span>
                          <Shield class="w-3 h-3" />
                      </div>
                  </div>

                  <!-- Buffs -->
                  <div class="flex flex-wrap gap-1 justify-end max-w-[150px]">
                     <div v-for="buff in en.buffs" :key="buff.id" class="relative group/buff">
                        <div class="w-6 h-6 rounded bg-black/60 border border-gray-500 flex items-center justify-center text-[10px] text-white cursor-help overflow-hidden">
                            <span class="scale-75">{{ buff.name.substring(0, 1) }}</span>
                        </div>
                        <!-- Tooltip -->
                        <div class="absolute bottom-full right-0 mb-2 w-32 bg-black/90 border border-gray-600 text-white text-xs p-2 rounded pointer-events-none opacity-0 group-hover/buff:opacity-100 transition-opacity z-[100] shadow-xl text-right">
                            <div class="font-bold text-yellow-400 mb-1">{{ buff.name }}</div>
                            <div class="mb-1 text-gray-300 leading-tight">{{ buff.description }}</div>

                            <!-- Effects Detail -->
                            <div v-if="buff.effects && buff.effects.length > 0" class="mt-1 mb-1 border-t border-gray-700 pt-1">
                                <div v-for="(eff, idx) in buff.effects" :key="idx" class="flex justify-between text-gray-400 text-[10px]">
                                    <span>{{ getEffectName(eff) }}</span>
                                    <span :class="eff.value > 0 ? 'text-green-400' : 'text-red-400'">
                                        {{ eff.value > 0 ? '+' : '' }}{{ eff.isPercentage ? Math.round(eff.value * 100) + '%' : eff.value }}
                                    </span>
                                </div>
                            </div>

                            <div class="text-blue-400 font-mono text-[10px]">剩余 {{ buff.duration }} 轮</div>
                        </div>
                     </div>
                  </div>
               </div>
           </div>
        </div>

      </div>

      <!-- Layer 2: HUD & Interface -->
      <div class="absolute inset-0 z-20 pointer-events-none">
         <!-- Force show test buff for debugging if player has no buffs but shield > 0 -->
         <!-- Note: This is just a comment, logic is in <script> -->
         
         <!-- Top Bar -->
         <div class="absolute top-0 left-0 w-full p-6 flex justify-between items-start bg-gradient-to-b from-black/80 to-transparent">
            <div class="flex flex-col">
               <div class="text-6xl font-black italic font-display text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-600 drop-shadow-lg tracking-tighter">
                  TURN {{ turn }}
               </div>
               <div class="text-sm text-gray-400 font-mono mt-1 tracking-widest uppercase">
                  Phase: {{ phase === 'player' ? 'PLAYER ACTION' : 'ENEMY TURN' }} 
                  <span v-if="selectionMode" class="text-red-500 font-bold animate-pulse ml-4">>> SELECT TARGET <<</span>
                  <span v-if="isActing" class="text-yellow-500 font-bold animate-pulse ml-4">>> EXECUTING... <<</span>
               </div>
               
               <!-- Message Carousel/Log HUD -->
               <div class="mt-4 w-[450px] flex flex-col gap-1 pointer-events-none mask-image-fade min-h-[100px]">
                  <transition-group name="log-fade" tag="div" class="flex flex-col gap-1">
                     <div v-for="log in combatLogs" :key="log.id" class="text-sm font-mono text-shadow-sm flex gap-2 items-start">
                        <span class="text-yellow-400 font-bold whitespace-nowrap drop-shadow-md">TURN {{ log.turn }}</span>
                        <span class="text-white/90 drop-shadow-md leading-tight">{{ log.content }}</span>
                     </div>
                  </transition-group>
               </div>
            </div>
            
            <!-- Close Debug Button (Replaced with End Game if Over) -->
            <button v-if="isGameOver" @click="closeCombat" class="pointer-events-auto px-4 py-2 bg-white/10 hover:bg-red-600 text-white rounded font-bold transition-colors border border-white/20 animate-bounce-in">
               FINISH
            </button>
         </div>

         <!-- Action Wheel (Bottom Right - Persona 5 Style) -->
         <div class="absolute bottom-10 right-20 pointer-events-auto perspective-1000" 
              :class="{ 'opacity-50 blur-[2px] pointer-events-none': selectionMode || isActing || phase !== 'player' || isGameOver }">
            
            <!-- Main Menu -->
            <div 
              v-if="currentMenu === 'main'"
              class="relative w-64 h-64 transition-all duration-500 transform-style-3d flex items-center justify-center"
              @mouseenter="isMenuOpen = true"
              @mouseleave="isMenuOpen = false"
            >
               
               <!-- Center: Attack (Pentagon) -->
               <button 
                 @click="handleAction('attack')"
                 @mouseenter="audioManager.playHover()"
                 class="absolute z-50
                        w-40 h-40 bg-red-600 hover:bg-red-500 text-white font-black text-3xl italic font-display
                        shadow-[0_0_40px_rgba(220,38,38,0.8)]
                        flex items-center justify-center pt-4
                        transition-all duration-500 ease-out group clip-pentagon-core animate-pulse-slow disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                 :class="{ 'rotate-[360deg] scale-110': isMenuOpen }"
                 :disabled="!canAttack"
               >
                 <span class="transform transition-transform drop-shadow-md" :class="isMenuOpen ? '-rotate-[360deg]' : ''">ATTACK</span>
               </button>

               <!-- Surrounding Buttons (Disabled/Hidden per requirement) -->
               
               <!-- 1. Spell (Top Right, 36deg) -->
               <button 
                  @click="switchMenu('spell')"
                  @mouseenter="audioManager.playHover()"
                  class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-purple-400 hover:bg-purple-600 hover:border-white text-purple-400 hover:text-white font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out hover:z-40 group"
                  :style="{ 
                    transform: isMenuOpen ? 'rotate(36deg) translateY(-105px) scale(1)' : 'rotate(216deg) translateY(0px) scale(0.5)',
                    opacity: isMenuOpen ? 1 : 0,
                    pointerEvents: isMenuOpen ? 'auto' : 'none'
                  }"
               >
                  <span class="transform -rotate-[36deg] group-hover:scale-110 transition-transform text-xl block">SPELL</span>
               </button>

               <!-- 2. Item (Bottom Right, 108deg) -->
               <button 
                  @click="switchMenu('item')"
                  @mouseenter="audioManager.playHover()"
                  class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-blue-400 hover:bg-blue-600 hover:border-white text-blue-400 hover:text-white font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out hover:z-40 group"
                  :style="{ 
                    transform: isMenuOpen ? 'rotate(108deg) translateY(-105px) scale(1)' : 'rotate(288deg) translateY(0px) scale(0.5)',
                    opacity: isMenuOpen ? 1 : 0,
                    pointerEvents: isMenuOpen ? 'auto' : 'none'
                  }"
               >
                  <span class="transform -rotate-[108deg] group-hover:scale-110 transition-transform text-xl block">ITEM</span>
               </button>

               <!-- 3. Special (Was Guard) -->
               <button 
                  @click="switchMenu('special')"
                  @mouseenter="audioManager.playHover()"
                  class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-yellow-400 hover:bg-yellow-600 hover:border-white text-yellow-400 hover:text-white font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out hover:z-40 group"
                  :style="{ 
                    transform: isMenuOpen ? 'rotate(180deg) translateY(-105px) scale(1)' : 'rotate(360deg) translateY(0px) scale(0.5)',
                    opacity: isMenuOpen ? 1 : 0,
                    pointerEvents: isMenuOpen ? 'auto' : 'none'
                  }"
               >
                  <span class="transform -rotate-[180deg] group-hover:scale-110 transition-transform text-xl block">SPECIAL</span>
               </button>

               <!-- 4. Escape (Disabled) -->
               <button 
                  class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-gray-700 text-gray-700 font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out cursor-not-allowed"
                  :style="{ 
                    transform: isMenuOpen ? 'rotate(252deg) translateY(-105px) scale(1)' : 'rotate(432deg) translateY(0px) scale(0.5)',
                    opacity: isMenuOpen ? 0.5 : 0
                  }"
               >
                  <span class="transform -rotate-[252deg] text-xl block">ESCAPE</span>
               </button>

               <!-- 5. Talk (Previously Jutsu) -->
               <button 
                  @click="switchMenu('talk')"
                  @mouseenter="audioManager.playHover()"
                  class="absolute z-20 w-32 h-32 -ml-16 -mt-16 bg-black border-2 border-green-400 hover:bg-green-600 hover:border-white text-green-400 hover:text-white font-bold text-lg font-display italic flex items-center justify-center clip-wedge transition-all duration-500 ease-out hover:z-40 group"
                  :style="{ 
                    transform: isMenuOpen ? 'rotate(324deg) translateY(-105px) scale(1)' : 'rotate(504deg) translateY(0px) scale(0.5)',
                    opacity: isMenuOpen ? 1 : 0,
                    pointerEvents: isMenuOpen ? 'auto' : 'none'
                  }"
               >
                  <span class="transform -rotate-[324deg] group-hover:scale-110 transition-transform text-xl block">TALK</span>
               </button>
            </div>

            <!-- Sub Menu: Spells -->
            <div v-else-if="currentMenu === 'spell'" class="relative w-80 min-h-[300px] flex flex-col gap-2 items-end animate-slide-in-right">
              <div class="text-3xl font-black italic text-purple-400 mb-4 drop-shadow-glow font-display">SPELL CARDS</div>
              
              <!-- Hover Info Panel -->
              <div v-if="hoveredSpell" class="absolute right-[110%] top-0 w-64 bg-black/80 border border-purple-500/50 p-4 rounded-lg backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.3)] animate-fade-in-fast z-50 pointer-events-none">
                 <h3 class="text-xl font-bold text-purple-300 mb-2 border-b border-purple-500/30 pb-1">{{ hoveredSpell.name }}</h3>
                 <div class="text-sm text-gray-300 space-y-2">
                     <p class="italic text-gray-400 text-xs">{{ hoveredSpell.description }}</p>
                     <div class="flex justify-between text-purple-200">
                         <span>消耗 MP:</span>
                         <span class="font-mono font-bold">{{ hoveredSpell.cost }}</span>
                     </div>
                     <div v-if="hoveredSpell.damage" class="flex justify-between text-red-300">
                         <span>威力:</span>
                         <span class="font-mono font-bold">{{ hoveredSpell.damage }}</span>
                     </div>
                     <div class="flex justify-between text-blue-300">
                         <span>类型:</span>
                         <span>{{ getSpellTypeName(hoveredSpell.type || '') }}</span>
                     </div>
                     <div v-if="hoveredSpell.buffDetails" class="text-xs text-green-300 border-t border-white/10 pt-1 mt-1">
                         <div class="font-bold mb-0.5">附加效果:</div>
                         <div>{{ hoveredSpell.buffDetails.description || hoveredSpell.buffDetails.name }}</div>
                         <div class="opacity-70">持续 {{ hoveredSpell.buffDetails.duration }} 回合</div>
                     </div>
                 </div>
              </div>
              
              <button 
                 v-for="(spell, idx) in spells" :key="idx"
                 @click="(player && player.mp >= spell.cost) ? handleAction('spell', spell) : null"
                 @mouseenter="audioManager.playHover(); hoveredSpell = spell"
                 @mouseleave="hoveredSpell = null"
                 class="w-full text-right px-6 py-3 border-r-4 transition-all clip-rect-left"
                 :class="[
                    (player && player.mp >= spell.cost)
                    ? 'bg-black/80 border-purple-500 hover:bg-purple-900/50 hover:border-white text-white hover:-translate-x-4 cursor-pointer' 
                    : 'bg-gray-900/80 border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                 ]"
              >
                 {{ spell.name }} <span class="text-xs ml-2" :class="(player && player.mp >= spell.cost) ? 'text-purple-300' : 'text-gray-600'">MP {{ spell.cost }}</span>
              </button>
              
              <button @click="currentMenu = 'main'" @mouseenter="audioManager.playHover()" class="mt-4 text-gray-400 hover:text-white font-bold italic transition-colors">BACK</button>
            </div>

            <!-- Sub Menu: Items -->
            <div v-else-if="currentMenu === 'item'" class="relative w-80 min-h-[300px] flex flex-col gap-2 items-end animate-slide-in-right">
              <div class="text-3xl font-black italic text-blue-400 mb-4 drop-shadow-glow font-display">ITEMS</div>
              
              <button 
                 v-for="(item, idx) in items" :key="idx"
                 @click="item.count > 0 ? handleAction('item', item) : null"
                 @mouseenter="audioManager.playHover()"
                 class="w-full text-right px-6 py-3 border-r-4 transition-all clip-rect-left"
                 :class="[
                    item.count > 0
                    ? 'bg-black/80 border-blue-500 hover:bg-blue-900/50 hover:border-white text-white hover:-translate-x-4 cursor-pointer'
                    : 'bg-gray-900/80 border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                 ]"
              >
                 {{ item.name }} <span class="text-xs text-blue-300 ml-2">x{{ item.count }}</span>
              </button>
              
              <button @click="currentMenu = 'main'" @mouseenter="audioManager.playHover()" class="mt-4 text-gray-400 hover:text-white font-bold italic transition-colors">BACK</button>
            </div>

            <!-- Sub Menu: Talk -->
            <div v-else-if="currentMenu === 'talk'" class="relative w-96 min-h-[300px] flex flex-col gap-2 items-end animate-slide-in-right">
              <div class="text-3xl font-black italic text-green-400 mb-4 drop-shadow-glow font-display flex items-center gap-2">
                 <MessageSquare class="w-8 h-8" />
                 PERSUASION
              </div>
              
              <div class="w-full bg-black/80 border-2 border-green-500 p-4 relative">
                 <textarea 
                    v-model="talkInput"
                    placeholder="说点什么来动摇对方..."
                    class="w-full h-32 bg-transparent !text-yellow-400 caret-yellow-400 font-bold resize-none outline-none font-sans text-lg placeholder:text-gray-500 drop-shadow-md"
                    :disabled="isProcessingTalk"
                    @keydown.enter.prevent="handleTalk"
                 ></textarea>
                 
                 <div v-if="isProcessingTalk" class="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span class="text-green-400 animate-pulse font-bold">思考中...</span>
                 </div>
              </div>

              <div class="flex gap-4 w-full justify-end mt-2 items-center">
                 <div v-if="player && (player.pPoints || 0) < 15" class="text-red-500 text-xs font-bold bg-black/50 px-2 py-1 rounded border border-red-500/50">需要 15 P 点</div>
                 <button 
                     @click="handleTalk"
                     :disabled="!talkInput.trim() || isProcessingTalk || ((player?.pPoints || 0) < 15)"
                     class="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold transition-colors clip-rect-left"
                  >
                    <Send class="w-4 h-4" />
                    SEND <span class="text-xs ml-1 opacity-90 font-mono">(15P)</span>
                 </button>
              </div>
              
              <button @click="currentMenu = 'main'" @mouseenter="audioManager.playHover()" class="mt-4 text-gray-400 hover:text-white font-bold italic transition-colors">BACK</button>
            </div>

            <!-- Sub Menu: Special -->
            <div v-else-if="currentMenu === 'special'" class="relative w-80 min-h-[300px] flex flex-col gap-2 items-end animate-slide-in-right">
              <div class="text-3xl font-black italic text-yellow-400 mb-4 drop-shadow-glow font-display">SPECIAL</div>
              <div class="w-full h-[300px] overflow-y-auto pr-2 custom-scrollbar flex flex-col gap-2">
                 <button 
                    v-for="skill in specialSkills" :key="skill.id"
                    @click="handleSpecialAction(skill)"
                    @mouseenter="audioManager.playHover()"
                    class="w-full text-right px-6 py-3 border-r-4 transition-all clip-rect-left flex flex-col items-end group"
                    :class="[
                       (player && (player.pPoints || 0) >= skill.costP && (player.actionPoints !== undefined ? player.actionPoints : 2) >= skill.costAP)
                       ? `bg-black/80 ${getSkillThemeClasses(skill.theme).border} ${getSkillThemeClasses(skill.theme).hoverBg} hover:border-white text-white hover:-translate-x-4 cursor-pointer` 
                       : 'bg-gray-900/80 border-gray-700 text-gray-500 cursor-not-allowed opacity-60'
                    ]"
                 >
                    <div class="flex items-center gap-2">
                        <span class="font-bold italic">{{ skill.name }}</span>
                        <span class="text-xs font-mono" :class="(player && (player.pPoints || 0) >= skill.costP) ? getSkillThemeClasses(skill.theme).textP : 'text-red-500'">{{ skill.costP }}P</span>
                        <span class="text-xs font-mono" :class="(player && (player.actionPoints !== undefined ? player.actionPoints : 2) >= skill.costAP) ? 'text-blue-300' : 'text-red-500'">{{ skill.costAP }}AP</span>
                    </div>
                    <div class="text-[10px] opacity-70 group-hover:opacity-100 transition-opacity">{{ skill.description }}</div>
                 </button>
              </div>
              
              <button @click="currentMenu = 'main'" @mouseenter="audioManager.playHover()" class="mt-4 text-gray-400 hover:text-white font-bold italic transition-colors">BACK</button>
            </div>
         </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, reactive, onUnmounted, onMounted } from 'vue';
import { Zap, Shield, MessageSquare, Send } from 'lucide-vue-next';
import type { Combatant, SpellCard, Buff, BuffEffect } from '@/types/combat';
import type { Item } from '@/types/game';
import { calculateDamage, processPersuasion, calculatePPointGain, getBaseDamage, getEffectiveStats } from '@/services/combatLogic';
import { useGameStore } from '@/stores/game';
import { useToastStore } from '@/stores/toast';
import { gameLoop } from '@/services/gameLoop';
import { audioManager } from '@/services/audio';
import defaultSprite from '@/assets/images/battle_sprites/其他角色.png';

const gameStore = useGameStore();
const emit = defineEmits(['close', 'combat-end']);

// --- BGM Management ---
const bgmFiles = import.meta.glob('/src/assets/audio/bgm/RPG_battle/**/*.{mp3,wav,ogg,flac,m4a,aac}', { as: 'url', eager: true });

// --- Background Management ---
const backgroundImages = import.meta.glob('/src/assets/images/battle_bg/*.{jpg,png,webp}', { as: 'url', eager: true });

const currentBackground = computed(() => {
    // Attempt to match current location
    const location = gameStore.state.player?.location;
    console.log('[CombatOverlay] Background Check - Location:', location);
    
    if (location) {
        // Try exact match first (ignoring extension)
        const exactMatch = Object.keys(backgroundImages).find(path => {
             const filename = path.split('/').pop()?.split('.')[0];
             return filename === location;
        });
        if (exactMatch) {
            console.log('[CombatOverlay] Found match:', exactMatch);
            return backgroundImages[exactMatch];
        }
    }
    
    // Fallback: Hakurei Shrine
    const fallback = Object.keys(backgroundImages).find(path => path.includes('博丽神社'));
    console.log('[CombatOverlay] Fallback to:', fallback);
    return fallback ? backgroundImages[fallback] : '';
});

function playCombatBgm() {
  if (!combatState.value?.bgm_suggestion) return;

  const styleKey = combatState.value.bgm_suggestion;
  
  // Strategy 1: Direct match (e.g. "常规", "激战")
  let matchingFiles = Object.keys(bgmFiles).filter(path => path.includes(styleKey));
  
  // Strategy 2: Keyword match if direct match fails
  if (matchingFiles.length === 0) {
      if (styleKey.includes('轻快')) {
          matchingFiles = Object.keys(bgmFiles).filter(path => path.includes('轻快'));
      } else if (styleKey.includes('BOSS') || styleKey.includes('Boss')) {
          matchingFiles = Object.keys(bgmFiles).filter(path => path.includes('BOSS') || path.includes('Boss'));
      } else if (styleKey.includes('激战')) {
          matchingFiles = Object.keys(bgmFiles).filter(path => path.includes('激战'));
      } else if (styleKey.includes('常规') || styleKey.includes('一般')) {
          matchingFiles = Object.keys(bgmFiles).filter(path => path.includes('常规'));
      }
  }

  if (matchingFiles.length > 0) {
    const randomFile = matchingFiles[Math.floor(Math.random() * matchingFiles.length)];
    if (randomFile) {
        const url = bgmFiles[randomFile] as string;
        if (typeof url === 'string') {
            audioManager.playBgm(url);
        }
    }
  } else {
      console.warn('No BGM found for style:', styleKey);
      // Fallback to '常规' if specific style not found
      if (styleKey !== '常规') {
         const fallbackFiles = Object.keys(bgmFiles).filter(path => path.includes('常规'));
         if (fallbackFiles.length > 0) {
            const randomFallback = fallbackFiles[Math.floor(Math.random() * fallbackFiles.length)];
            if (randomFallback) {
                const url = bgmFiles[randomFallback] as string;
                if (typeof url === 'string') {
                   audioManager.playBgm(url);
                }
            }
         }
      }
  }
}

onUnmounted(() => {
    audioManager.stopBgm();
});

onMounted(() => {
    // [Optimization] Logic moved to GameStore.setState to handle refresh state sanitization centrally.
});

// --- Store Integration ---
const combatState = computed(() => gameStore.state.system.combat);
const isPending = computed(() => !!combatState.value?.isPending);
const isActive = computed(() => !!combatState.value?.isActive);
const showOverlay = computed(() => !!combatState.value && (isActive.value || isPending.value));

// --- Ally Stack Management ---
const activeAllyId = ref<string | null>(null);

const sortedAllies = computed(() => {
    if (!allies.value || allies.value.length === 0) return [];
    
    // Sort initially by name if no active ID is set
    let list = [...allies.value].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    
    // Ensure activeAllyId is valid
    if (!activeAllyId.value && list.length > 0) {
        activeAllyId.value = list[0]?.id || null;
    }
    
    // Reorder: Active ally first
    const activeIndex = list.findIndex(a => a.id === activeAllyId.value);
    if (activeIndex > -1) {
        const [active] = list.splice(activeIndex, 1);
        if (active) list.unshift(active);
    } else if (list.length > 0) {
        activeAllyId.value = list[0]?.id || null;
    }
    
    return list;
});

function activateAlly(id: string) {
    activeAllyId.value = id;
    audioManager.playClick();
}

// --- Interfaces for UI ---
interface CombatLog {
  id: number;
  turn: number;
  content: string;
}

interface Popup {
  id: number;
  text: string | number;
  type: 'damage' | 'heal' | 'crit' | 'buff' | 'debuff';
}

interface UICombatant extends Combatant {
  popups: Popup[];
  // Maintain refs for compatibility with template
}

// --- Local State for UI/Animations ---
// We map the store combatants to local reactive objects to handle UI-only state (popups)
// But we must ensure they stay in sync. 
// Actually, it's easier to create a local map of ID -> Popups and join them in the computed.
const popupMap = reactive<Record<string, Popup[]>>({});

// Initialize popup array for a combatant if not exists
const getPopups = (id: string) => {
    if (!popupMap[id]) popupMap[id] = [];
    return popupMap[id];
};

const enemies = computed(() => {
    return (combatState.value?.combatants.filter(c => !c.isPlayer && c.team !== 'player') || []).map(c => ({
        ...c,
        popups: getPopups(c.id)
    })) as UICombatant[];
});

const allies = computed(() => {
    return (combatState.value?.combatants.filter(c => !c.isPlayer && c.team === 'player') || []).map(c => ({
        ...c,
        popups: getPopups(c.id)
    })) as UICombatant[];
});

const player = computed(() => {
    const p = combatState.value?.combatants.find(c => c.isPlayer);
    if (!p) return null;
    
    // Calculate Effective Stats using shared logic (Includes Level scaling)
    const stats = getEffectiveStats(p);

    return {
        ...p,
        buffs: p.buffs || [],
        dodgeRate: stats.dodgeRate, // Override for UI display
        popups: getPopups(p.id)
    } as UICombatant;
});

const canAttack = computed(() => {
    if (isActing.value) return false;
    if (phase.value !== 'player') return false;
    if (!player.value) return false;
    
    const ap = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
    return ap > 0;
});

const enemyNames = computed(() => enemies.value.map(e => e.name).join(', '));
const turn = computed(() => combatState.value?.turn || 1);

// Data Access
const spells = computed(() => player.value?.spellCards || []);
const items = computed(() => {
    const allItems = gameStore.state.player.items || [];
    return allItems.filter(item => {
        // Exclude special/key/equipment items explicitly
        if (['special', 'key_item', 'equipment'].includes(item.type)) return false;
        
        // Include if explicitly consumable or material
        if (item.type === 'consumable' || item.type === 'material') return true;
        
        // Include if has combat effects (fallback)
        if (item.effects && (item.effects.heal || item.effects.hp || item.effects.mp || item.effects.buff)) {
            return true;
        }
        
        return false;
    });
});

// Animation Refs
const hoveredSpell = ref<SpellCard | null>(null);
const currentMenu = ref<'main' | 'spell' | 'item' | 'talk' | 'special'>('main');
const isMenuOpen = ref(false);
const isScreenShaking = ref(false);
const showIntro = ref(false); // New Intro State
const isActing = ref(false); 
const selectionMode = ref(false);
const pendingAction = ref<{ type: string, payload?: any } | null>(null);
const activeEffect = ref<{ 
    type: 'slash' | 'spell' | 'enemy' | 'hit' | 'talk' | 'ultimate_impact', 
    x: number, 
    y: number, 
    show: boolean,
    extra?: string 
}>({ type: 'slash', x: 0, y: 0, show: false });
const phase = ref<'player' | 'ally' | 'enemy'>('player');
const hoveredEnemyId = ref<string | null>(null);

const isGameOver = ref(false);
const gameResult = ref<'win' | 'loss' | 'escape' | null>(null);
const combatLogs = ref<CombatLog[]>([]);

// --- Enemy Queue System ---
const exitedEnemyIds = ref<string[]>([]);

const visibleEnemies = computed(() => {
    return enemies.value.filter(e => !exitedEnemyIds.value.includes(e.id));
});

const activeEnemies = computed(() => visibleEnemies.value.slice(0, 3));
const reserveEnemies = computed(() => visibleEnemies.value.slice(3));

// Watch for deaths to trigger exit
watch(enemies, (newEnemies) => {
    newEnemies.forEach(e => {
        if (e.hp <= 0 && !exitedEnemyIds.value.includes(e.id)) {
            // Delay exit to allow death animation (shatter) to play
            // Use a unique timeout per enemy? Simple timeout is fine.
            setTimeout(() => {
                if (!exitedEnemyIds.value.includes(e.id)) {
                     exitedEnemyIds.value.push(e.id);
                }
            }, 2500); // 2.5 seconds delay (Shatter animation is ~1s, FlashOut is 3.5s? Shatter is infinite? No)
        }
    });
}, { deep: true });

// Ultimate Cut-in State
const showUltimateCutin = ref(false);
const ultimateCutinData = ref({
    isPlayer: true,
    charName: '',
    spellName: '',
    spriteUrl: ''
});

// Skill Cut-in State
const showSkillCutin = ref(false);
const skillCutinData = ref({
    isPlayer: true,
    charName: '',
    spellName: '',
    spriteUrl: ''
});

// Watchers
watch(isActive, (val) => {
  if (val) {
    // Reset state on combat start
    isGameOver.value = false;
    gameResult.value = null;
    phase.value = 'player';
    isActing.value = false;
    selectionMode.value = false;
    currentMenu.value = 'main';
    combatLogs.value = [];
    exitedEnemyIds.value = []; // Clear exited enemies
    // Clear popups
    for (const key in popupMap) {
        popupMap[key] = [];
    }
  }
});

// --- Helpers ---
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function playUltimateAnimation(combatant: Combatant | UICombatant, spellName: string) {
    const isPlayerTeam = combatant.isPlayer || combatant.team === 'player';
    ultimateCutinData.value = {
        isPlayer: isPlayerTeam,
        charName: combatant.name,
        spellName: spellName,
        // Correct Sprite Logic: Use '主角' only if it's the player ID, otherwise use name
        spriteUrl: getSpriteUrl(combatant.id === 'player' ? '主角' : combatant.name)
    };
    
    // SFX
    audioManager.playSpellCast(); 
    
    // Show Cut-in
    showUltimateCutin.value = true;
    
    // Wait for animation (Flash + Slide + Hold)
    await sleep(2500);
    
    // Hide
    showUltimateCutin.value = false;
}

async function playSkillAnimation(combatant: Combatant | UICombatant, spellName: string) {
    const isPlayerTeam = combatant.isPlayer || combatant.team === 'player';
    skillCutinData.value = {
        isPlayer: isPlayerTeam,
        charName: combatant.name,
        spellName: spellName,
        spriteUrl: getSpriteUrl(combatant.id === 'player' ? '主角' : combatant.name)
    };
    
    audioManager.playSkillCutin(); 
    
    showSkillCutin.value = true;
    await sleep(800); // Shorter duration
    showSkillCutin.value = false;
}

function switchMenu(menu: 'main' | 'spell' | 'item' | 'talk' | 'special') {
  audioManager.playClick();
  currentMenu.value = menu;
  selectionMode.value = false;
  pendingAction.value = null;
}

function addLog(content: string) {
  combatLogs.value.unshift({
    id: Date.now() + Math.random(),
    turn: turn.value,
    content
  });
  if (combatLogs.value.length > 5) combatLogs.value.pop();

  // Sync to Store (Full History for LLM)
  if (combatState.value) {
      if (!combatState.value.logs) combatState.value.logs = [];
      combatState.value.logs.push({
          turn: turn.value,
          actorId: 'system',
          actorName: '系统',
          actionType: 'wait',
          targetNames: [],
          description: content
      });
  }
}

let popupIdCounter = 0;

function getEffectName(effect: BuffEffect): string {
    if (effect.type === 'stat_mod') {
        const statMap: Record<string, string> = {
            'attack': '攻击',
            'defense': '防御',
            'dodge': '闪避',
            'damage_taken': '易伤'
        };
        return statMap[effect.targetStat || ''] || '属性';
    } else if (effect.type === 'damage_reduction') {
        return '减伤';
    } else if (effect.type === 'dodge_mod') {
        return '闪避';
    } else if (effect.type === 'shield') {
        return '护盾';
    } else if (effect.type === 'heal') {
        return '回复';
    } else if (effect.type === 'damage_over_time') {
        return '持续易伤';
    }
    return '效果';
}

function getSpellTypeName(type: string): string {
    const map: Record<string, string> = {
        'attack': '攻击',
        'buff': '增益',
        'debuff': '减益',
        'shield': '护盾',
        'heal': '治疗'
    };
    return map[type] || '特殊';
}

function addPopup(target: UICombatant, value: number | string, type: 'damage' | 'heal' | 'crit' | 'buff' | 'debuff' = 'damage') {
  const id = popupIdCounter++;
  const list = getPopups(target.id);
  list.push({ id, text: value, type });
  
  setTimeout(() => {
    const idx = list.findIndex(p => p.id === id);
    if (idx > -1) list.splice(idx, 1);
  }, 1000);
}

const characterSprites = import.meta.glob('/src/assets/images/battle_sprites/*.png', { as: 'url', eager: true });

function getSpriteUrl(name?: string) {
    if (!name) return defaultSprite;
    const path = `/src/assets/images/battle_sprites/${name}_战斗立绘.png`;
    const found = characterSprites[path];
    return (found as string) || defaultSprite;
}

function getEnemyEffectiveDodge(enemy: UICombatant) {
    const baseDodge = enemy.dodgeRate || 0.15;
    let dodgeMod = 0;
    if (enemy.buffs) {
        enemy.buffs.forEach(b => {
            b.effects.forEach(e => {
                if (e.type === 'dodge_mod') {
                    dodgeMod += e.value;
                }
            });
        });
    }
    return baseDodge + dodgeMod;
}

// --- Visual Style Helpers ---
function getPlayerHpStyle(hp: number, maxHp: number) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  let r, g, b;
  if (ratio > 0.5) {
      const t = (ratio - 0.5) * 2;
      r = Math.round(234 + (34 - 234) * t);
      g = Math.round(179 + (197 - 179) * t);
      b = Math.round(8 + (94 - 8) * t);
  } else {
      const t = ratio * 2;
      r = Math.round(239 + (234 - 239) * t);
      g = Math.round(68 + (179 - 68) * t);
      b = Math.round(68 + (8 - 68) * t);
  }
  const color = `rgb(${r}, ${g}, ${b})`;
  return { borderColor: color, color: color, boxShadow: `0 0 20px rgba(${r}, ${g}, ${b}, 0.4)` };
}

function getEnemyHpStyle(hp: number, maxHp: number) {
  const ratio = Math.max(0, Math.min(1, hp / maxHp));
  const r = Math.round(254 + (220 - 254) * ratio);
  const g = Math.round(202 + (38 - 202) * ratio);
  const b = Math.round(202 + (38 - 202) * ratio);
  const color = `rgb(${r}, ${g}, ${b})`;
  const percent = ratio * 100;
  return {
    borderColor: color, color: color,
    boxShadow: `0 0 10px rgba(${r}, ${g}, ${b}, 0.4)`,
    background: `linear-gradient(to left, rgba(${r}, ${g}, ${b}, 0.3) ${percent}%, rgba(0,0,0,0.8) ${percent}%)`
  };
}

async function triggerShake() {
  isScreenShaking.value = true;
  await sleep(500);
  isScreenShaking.value = false;
}

async function triggerEffect(
    type: 'slash' | 'spell' | 'enemy' | 'hit' | 'talk' | 'ultimate_impact', 
    x: number, 
    y: number,
    extra?: string
) {
  activeEffect.value = { type, x, y, show: true, extra };
  
  let duration = 1000;
  if (type === 'spell') duration = 2200;
  else if (type === 'ultimate_impact') duration = 2500;
  else if (type === 'talk') duration = 2000;
  else if (type === 'slash') duration = 800;
  else if (type === 'hit') duration = 500;

  await sleep(duration);
  activeEffect.value.show = false;
}

// --- Combat Logic ---

function startCombat() {
  if (combatState.value) {
      // Trigger Intro First
      showIntro.value = true;
      playIntroSequence();
      
      gameStore.updateState({
        system: {
          ...gameStore.state.system,
          combat: { ...combatState.value, isPending: false, isActive: true }
        }
      });
  }
}

async function playIntroSequence() {
    // 1. Initial Burst
    audioManager.playChime();
    
    // 2. Slide In (Left/Right)
    await sleep(200);
    audioManager.playSlash(); // Left
    await sleep(400);
    audioManager.playSlash(); // Right
    
    // 3. VS Slam
    await sleep(600);
    audioManager.playHeavyHit();
    triggerShake();
    
    // 4. Hold & Fade
    await sleep(2500);
    showIntro.value = false;
    playCombatBgm();
}

function skipCombat() {
   const toastStore = useToastStore();
   audioManager.stopBgm();
   gameStore.updateState({ system: { ...gameStore.state.system, combat: null } });
   toastStore.addToast('已切换至自由剧情模式', 'info');
}

// --- Helper to Sync State ---
function updateCombatantState(id: string, updates: Partial<Combatant>) {
    // Validate inputs to prevent NaN propagation
    if (updates.hp !== undefined) {
        const val = Number(updates.hp);
        if (isNaN(val)) {
            console.warn('[CombatOverlay] Ignored invalid HP update:', updates.hp);
            delete updates.hp;
        } else {
            updates.hp = val;
        }
    }
    if (updates.mp !== undefined) {
        const val = Number(updates.mp);
        if (isNaN(val)) {
             console.warn('[CombatOverlay] Ignored invalid MP update:', updates.mp);
             delete updates.mp;
        } else {
            updates.mp = val;
        }
    }

    // 1. Update Store Combat State (Source of Truth for Combat)
    if (combatState.value) {
        const storeCombatant = combatState.value.combatants.find(c => c.id === id);
        if (storeCombatant) {
            Object.assign(storeCombatant, updates);
        }
    }

    // 2. Update Global State (Player or NPC)
    // Find if it's player
    if (gameStore.state.player && id === 'player') {
        if (updates.hp !== undefined) {
             gameStore.applyAction({
                 type: 'UPDATE_PLAYER', field: 'hp', op: 'set', value: updates.hp
             });
        }
        if (updates.mp !== undefined) {
             gameStore.applyAction({
                 type: 'UPDATE_PLAYER', field: 'mp', op: 'set', value: updates.mp
             });
        }
    } else {
        // It's an NPC (or Enemy)
        // Always try to update/create the NPC in store. 
        // This ensures that even ephemeral enemies (from Static DB) get their state persisted,
        // preventing the "HP: ?" issue in CharacterList if they are added to the scene later.
        if (updates.hp !== undefined) {
             gameStore.applyAction({
                 type: 'UPDATE_NPC', npcId: id, field: 'hp', op: 'set', value: updates.hp
             });
        }
        if (updates.mp !== undefined) {
             // Only update MP if the store supports it for NPCs (currently UPDATE_NPC might strictly check fields)
             // But let's try it, as gameStore might ignore invalid fields gracefully or we can add it.
             // Looking at gameStore, 'mp' is NOT in STRICT_NPC_NUMERIC_FIELDS (hp, max_hp, favorability, obedience).
             // But it might be allowed as a generic field.
             // However, NPCs usually don't track MP in this system (they use cooldowns/patterns). 
             // But if we want to track it, we can.
             // For now, let's skip MP to avoid clutter/warnings if not supported, unless necessary.
             // Actually, gameStore UPDATE_NPC allows generic fields.
             // But let's focus on HP which is the reported issue.
        }
    }
}

// Core Logic Wrapper
async function executeAction(attacker: Combatant, defender: UICombatant, actionName: string = '普通攻击', spell?: SpellCard) {
  // Use existing service logic for calculation
  const result = calculateDamage(attacker, defender, spell);
  
  // Apply Spell Effects (Debuffs) if any
  if (spell && spell.buffDetails) {
      applyBuff(defender, spell.buffDetails, 'debuff');
  }

  if (result.damage > 0) {
      if (defender.shield && defender.shield > 0) {
          // Shield Gate Logic: Damage is capped at shield value by calculateDamage
          defender.shield -= result.damage;
          updateCombatantState(defender.id, { shield: defender.shield });
          
          addPopup(defender, result.damage, 'buff'); 
          if (defender.shield <= 0) {
              addLog(`${attacker.name} ${actionName}，击碎了 ${defender.name} 的护盾！`);
              audioManager.playShatter();
          } else {
              addLog(`${attacker.name} ${actionName}，造成了 ${result.damage} 点护盾伤害！`);
          }
      } else {
          const newHp = Math.max(0, defender.hp - result.damage);
          defender.hp = newHp; // Local visual update
          updateCombatantState(defender.id, { hp: newHp });
          
          addPopup(defender, result.damage, 'damage');
          
          // Trigger Hit Spark
          // Only if it's not a generic AOE where we can't target individually easily? 
          // Actually we can, but let's keep it simple. 
          // If defender is enemy (right side), hit effect is on right.
          // If defender is player (left side), hit effect is on left.
          // We don't have exact coordinates, so we estimate.
          const isPlayer = defender.isPlayer || defender.team === 'player';
          const rect = document.body.getBoundingClientRect();
          const targetX = isPlayer ? rect.width * 0.25 : rect.width * 0.75;
          const targetY = rect.height * 0.4;
          
          // Don't await this, let it play
          triggerEffect('hit', targetX, targetY);

          addLog(result.description);
      }
  }

  // Handle Heal
  if (result.heal > 0) {
      const newHp = Math.min(defender.maxHp, defender.hp + result.heal);
      defender.hp = newHp;
      updateCombatantState(defender.id, { hp: newHp });
      
      addPopup(defender, result.heal, 'heal');
      addLog(`${attacker.name} ${actionName}，恢复了 ${result.heal} 点HP！`);
  } else if (result.damage <= 0) {
      // Handle Miss / 0 Damage (Only if no damage and no heal)
      // Check if it was a hit despite 0 damage (e.g. debuff only or 0 dmg spell)
      if (result.isHit && spell && spell.buffDetails) {
          // It was a hit, but 0 damage. Since we have buffs, show success.
          addPopup(defender, spell.buffDetails.name, 'buff');
          addLog(result.description);
      } else if (result.isHit) {
          // Hit but 0 damage and no buffs? (Weak attack)
          addPopup(defender, '0', 'damage');
          addLog(result.description);
      } else {
          // Miss
          addPopup(defender, 'MISS', 'damage');
          addLog(result.description || `${attacker.name} 的${actionName}对 ${defender.name} 未命中！`);
      }
  }

  // P-Point Gain Logic (Player Normal Attack)
  // Independent Check
  if ((attacker.isPlayer || attacker.team === 'player') && !spell) {
       // Only gain P-points if the attack landed
       if (result.isHit) {
           const pGain = calculatePPointGain(attacker, result.damage);
           const currentP = attacker.pPoints || 0;
           const maxP = attacker.maxPPoints || 100;
           const newP = Math.min(maxP, currentP + pGain);
           
           updateCombatantState(attacker.id, { pPoints: newP });
           
           // Optional: Add P-point popup
           const uiAttacker = attacker.id === player.value?.id ? player.value : null;
           if (uiAttacker) {
               addPopup(uiAttacker, `+${pGain.toFixed(1)} P`, 'buff');
           }
       }
  }
  
  // Check Death
  if (defender.hp <= 0 && defender.id && gameStore.state.npcs[defender.id]) {
      // Already synced via helper
  }
}

// --- Helper to Apply Buffs ---
function applyBuff(target: UICombatant, buffDetails: any, type: 'buff' | 'debuff' = 'buff') {
    if (!buffDetails) return;
    
    if (!target.buffs) target.buffs = [];
    
    const newBuff: Buff = {
        id: `buff_${Date.now()}_${Math.random()}`,
        name: buffDetails.name || '未知效果',
        type: type,
        description: buffDetails.description || buffDetails.name || '效果持续中',
        duration: buffDetails.duration || 3,
        createdTurn: turn.value,
        effects: (buffDetails.effects || []).map((e: any) => ({
            type: e.type,
            targetStat: e.targetStat,
            value: Number(e.value) || 0,
            isPercentage: e.isPercentage !== false // Default true unless specified
        }))
    };
    
    target.buffs.push(newBuff);
    updateCombatantState(target.id, { buffs: target.buffs });
    addPopup(target, newBuff.name, type);
    addLog(`${target.name} ${type === 'buff' ? '获得了' : '陷入了'}状态：${newBuff.name}！`);
}

// Main Action Handler (Player)
async function handleAction(type: string, payload?: any) {
  if (isActing.value || phase.value !== 'player') return;
  if (!player.value) return;

  // AP Check
  const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
  if (currentAP < 1) {
      addPopup(player.value, '行动点不足', 'damage');
      return;
  }

  if (type === 'attack') {
     audioManager.playClick();
     selectionMode.value = true;
     pendingAction.value = { type, payload };
  } else if (type === 'spell') {
     const spell = payload as SpellCard;
     if (!player.value) return;
     
     if (player.value.mp >= spell.cost) {
        // Special Case: Self-Buff / Shield / Heal (Immediate Execution)
        if (spell.type === 'buff' || spell.type === 'shield' || spell.type === 'heal') {
            isActing.value = true;
            currentMenu.value = 'main';

            // Ultimate Cut-in
            if (spell.isUltimate) await playUltimateAnimation(player.value, spell.name);

            const newMp = player.value.mp - spell.cost;
            player.value.mp = newMp;
            updateCombatantState(player.value.id, { mp: newMp });

            audioManager.playSpellCast();
            const rect = document.body.getBoundingClientRect();
            // Self Effect
            triggerEffect('spell', rect.width * 0.2, rect.height * 0.8); 
            
            await sleep(2200);
            
            // Apply Logic
            if (spell.type === 'shield') {
                // Shield Logic
                let shieldVal = spell.damage || 0;
                // Check buffDetails for shield effect
                if (spell.buffDetails && spell.buffDetails.effects) {
                    const shieldEff = spell.buffDetails.effects.find(e => e.type === 'shield');
                    if (shieldEff) shieldVal += shieldEff.value;
                }
                
                if (shieldVal > 0) {
                    player.value.shield = (player.value.shield || 0) + shieldVal;
                    updateCombatantState(player.value.id, { shield: player.value.shield });
                    addPopup(player.value, shieldVal, 'buff');
                    addLog(`${player.value.name} 释放了 ${spell.name}，获得了 ${shieldVal} 点护盾！`);
                }
            } else if (spell.type === 'heal') {
                // Heal Logic
                let healVal = 0;
                let isInstant = false;
                
                if (spell.buffDetails) {
                    // Heuristic: If duration is 1, it's instant heal. If > 1, it's HoT.
                    if (spell.buffDetails.duration === 1) {
                         isInstant = true;
                         // Extract value
                         if (spell.buffDetails.effects) {
                             const healEff = spell.buffDetails.effects.find(e => e.type === 'heal');
                             if (healEff) healVal += healEff.value;
                         }
                    }
                }
                
                if (isInstant && healVal > 0) {
                    const newHp = Math.min(player.value.maxHp, player.value.hp + healVal);
                    player.value.hp = newHp;
                    updateCombatantState(player.value.id, { hp: newHp });
                    addPopup(player.value, healVal, 'heal');
                    addLog(`${player.value.name} 释放了 ${spell.name}，恢复了 ${healVal} 点生命！`);
                }
            }
            
            // Apply Buffs (if any)
            if (spell.buffDetails) {
                 // For instant heal spells, skip adding buff to avoid double healing next turn
                 const isInstantHeal = spell.type === 'heal' && spell.buffDetails.duration === 1;
                 if (!isInstantHeal) {
                     applyBuff(player.value, spell.buffDetails, 'buff');
                 }
            }

            await sleep(1000);
            
            // Deduct AP (Cost 2)
            const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
            updateCombatantState(player.value.id, { actionPoints: Math.max(0, currentAP - 2) });
            
            // End Turn Check
            checkTurnEnd();
            return;
        }

        if (spell.scope === 'aoe') {
            // Immediate Execution for AOE
            isActing.value = true;
            currentMenu.value = 'main';

            // Ultimate Cut-in
            if (spell.isUltimate) await playUltimateAnimation(player.value, spell.name);

            const newMp = player.value.mp - spell.cost;
            player.value.mp = newMp;
            updateCombatantState(player.value.id, { mp: newMp });
            
            // 1. Cast
            audioManager.playSpellCast();
            const rect = document.body.getBoundingClientRect();
            
            if (spell.isUltimate) {
                triggerEffect('ultimate_impact', rect.width * 0.5, rect.height * 0.5);
                setTimeout(() => audioManager.playShatter(), 200);
            } else {
                triggerEffect('spell', rect.width * 0.5, rect.height * 0.5);
            }
            
            await sleep(spell.isUltimate ? 2500 : 2200);

            // 2. Impact
            triggerShake();
            audioManager.playHeavyHit();

            // AOE Logic (Apply to all enemies)
            let anyKilled = false;
            let totalDmg = 0;
            
            for (const enemy of enemies.value) {
               if (enemy.hp > 0) {
                   const result = calculateDamage(player.value!, enemy, spell);
                   
                   if (enemy.shield && enemy.shield > 0) {
                       enemy.shield -= result.damage;
                       updateCombatantState(enemy.id, { shield: enemy.shield });
                       addPopup(enemy, result.damage, 'buff');
                   } else {
                       const newHp = Math.max(0, enemy.hp - result.damage);
                       enemy.hp = newHp;
                       updateCombatantState(enemy.id, { hp: newHp });
                       
                       if (result.damage > 0) {
                       addPopup(enemy, result.damage, 'damage');
                       
                       // Hit Spark for AOE
                       // Randomize slightly on the right side
                       const rX = rect.width * (0.6 + Math.random() * 0.3);
                       const rY = rect.height * (0.3 + Math.random() * 0.4);
                       triggerEffect('hit', rX, rY);
                       
                   } else if (!spell.buffDetails) {
                           addPopup(enemy, 'MISS', 'damage');
                       }
                       
                       if (enemy.hp <= 0) anyKilled = true;
                   }
                   totalDmg += result.damage;

                   // Apply Debuffs (if any)
                   if (spell.buffDetails) {
                       applyBuff(enemy, spell.buffDetails, 'debuff');
                   }
               }
            }

            let logMsg = `${player.value.name} 释放了符卡 ${spell.name}`;
            if (totalDmg > 0) {
                logMsg += `，对所有敌方单位造成了 ${totalDmg} 点总伤害`;
            }
            if (spell.buffDetails) {
                logMsg += `，并附加了【${spell.buffDetails.name}】`;
            }
            if (totalDmg === 0 && !spell.buffDetails) {
                logMsg += `，但似乎没有明显效果`;
            }
            logMsg += "！";
            addLog(logMsg);
            
            if (anyKilled) {
               audioManager.playShatter();
            }
            
            await sleep(1500);
            
            // Deduct AP (Cost 2)
            const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
            updateCombatantState(player.value.id, { actionPoints: Math.max(0, currentAP - 2) });
            
            // End Turn Check
            checkTurnEnd();
        } else {
            // Single Target -> Selection Mode
            audioManager.playClick();
            selectionMode.value = true;
            pendingAction.value = { type: 'spell', payload: spell };
        }
     } else {
        addPopup(player.value, 'MP不足', 'damage');
     }
  } else if (type === 'item') {
     const item = payload as Item;
     if (!player.value) return;
     
     // Safety Check
     if (['special', 'key_item', 'equipment'].includes(item.type)) {
         addPopup(player.value, '不可使用', 'damage');
         return;
     }

     if (item.count > 0) {
        // Assume Self-Use for Consumables for now
        // TODO: Support target selection for items if needed
        isActing.value = true;
        currentMenu.value = 'main';

        try {
            item.count--; // Consume
            
            // Apply Effect
            let processed = false;
            const effects = item.effects || {};
            
            // 1. Heal / HP
            const healAmount = Number(effects.heal) || Number(effects.hp) || 0;
            if (healAmount > 0) {
                 const newHp = Math.min(player.value.maxHp, player.value.hp + healAmount);
                 player.value.hp = newHp;
                 updateCombatantState(player.value.id, { hp: newHp });
                 addPopup(player.value, healAmount, 'heal');
                 addLog(`${player.value.name} 使用了道具 ${item.name}，恢复了 ${healAmount} 点HP！`);
                 processed = true;
            }
            
            // 2. MP
            const mpAmount = Number(effects.mp) || 0;
            if (mpAmount > 0) {
                 const newMp = Math.min(player.value.maxMp, player.value.mp + mpAmount);
                 player.value.mp = newMp;
                 updateCombatantState(player.value.id, { mp: newMp });
                 addPopup(player.value, mpAmount, 'heal'); 
                 addLog(`${player.value.name} 使用了道具 ${item.name}，恢复了 ${mpAmount} 点MP！`);
                 processed = true;
            }
            
            if (!processed) {
                addLog(`${player.value.name} 使用了 ${item.name}，但是什么也没有发生...`);
            } else {
                audioManager.playHeal();
            }
            
            await sleep(1000);
            
            // Deduct AP (Cost 1)
            if (player.value) {
                const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
                updateCombatantState(player.value.id, { actionPoints: Math.max(0, currentAP - 1) });
            }
            
            checkTurnEnd();
        } catch (e) {
            console.error("Item execution error:", e);
            addLog(`[错误] 道具使用失败: ${e}`);
            phase.value = 'player'; // Recover
        } finally {
            isActing.value = false;
        }
     }
  }
}

// Talk Logic
const talkInput = ref('');
const isProcessingTalk = ref(false);

const specialSkills = [
    { id: 'active_defense', name: '主动防御', costP: 30, costAP: 1, description: '获得一层数值为“0.5 * 基础攻击力”的护盾', theme: 'blue' },
    { id: 'inner_power', name: '内源之力', costP: 40, costAP: 2, description: '施加“内伤”DEBUFF，下回合造成(1.2~1.5)倍攻击力的真实伤害', theme: 'red' },
    { id: 'indomitable_will', name: '不屈意志', costP: 60, costAP: 2, description: '恢复1倍攻击力的生命，并获得30%伤害减免(2回合)', theme: 'orange' },
    { id: 'combat_flow', name: '战斗心流', costP: 80, costAP: 1, description: '3回合内增加25%增伤、25%减伤及20%闪避率', theme: 'purple' }
];

function getSkillThemeClasses(theme: string) {
    const map: Record<string, any> = {
        blue: { border: 'border-cyan-500', hoverBg: 'hover:bg-cyan-900/50', textP: 'text-cyan-300' },
        red: { border: 'border-red-500', hoverBg: 'hover:bg-red-900/50', textP: 'text-red-300' },
        orange: { border: 'border-orange-500', hoverBg: 'hover:bg-orange-900/50', textP: 'text-orange-300' },
        purple: { border: 'border-purple-500', hoverBg: 'hover:bg-purple-900/50', textP: 'text-purple-300' },
        yellow: { border: 'border-yellow-500', hoverBg: 'hover:bg-yellow-900/50', textP: 'text-yellow-300' }
    };
    return map[theme] || map.yellow;
}

async function handleSpecialAction(skill: any) {
    if (!player.value) return;
    
    // Cost Check
    const currentP = player.value.pPoints || 0;
    const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
    
    if (currentP < skill.costP) {
        addPopup(player.value, 'P点不足', 'damage');
        audioManager.playSoftClick(); // Or error sound
        return;
    }
    if (currentAP < skill.costAP) {
        addPopup(player.value, 'AP不足', 'damage');
        audioManager.playSoftClick();
        return;
    }
    
    // For targeted skills, enter selection mode BEFORE deducting costs
    if (skill.id === 'inner_power') {
         // isActing.value = true; // REMOVED: Do not block UI before selection
         currentMenu.value = 'main';
         selectionMode.value = true;
         pendingAction.value = { type: 'special', payload: skill };
         audioManager.playClick();
         return;
    }
    
    // For self-cast skills, execute immediately
    // Deduct Costs
    updateCombatantState(player.value.id, { 
        pPoints: Math.max(0, currentP - skill.costP),
        actionPoints: Math.max(0, currentAP - skill.costAP)
    });
    
    isActing.value = true;
    currentMenu.value = 'main';
    
    try {
        const baseDmg = getBaseDamage(player.value.power);
        
        if (skill.id === 'active_defense') {
            const shieldVal = Math.round(0.5 * baseDmg);
            player.value.shield = (player.value.shield || 0) + shieldVal;
            updateCombatantState(player.value.id, { shield: player.value.shield });
            
            const rect = document.body.getBoundingClientRect();
            triggerEffect('spell', rect.width * 0.25, rect.height * 0.6); // Visual
            
            addPopup(player.value, shieldVal, 'buff');
            addLog(`${player.value.name} 发动【主动防御】，获得了 ${shieldVal} 点护盾！`);
            audioManager.playHeal(); 
            
            await sleep(1000);
            checkTurnEnd();
        } else if (skill.id === 'indomitable_will') {
             const healVal = Math.round(1.0 * baseDmg);
             const newHp = Math.min(player.value.maxHp, player.value.hp + healVal);
             player.value.hp = newHp;
             updateCombatantState(player.value.id, { hp: newHp });

             // Buff: 30% Damage Reduction for 2 turns
             const buff: Buff = {
                 id: `buff_will_${Date.now()}`,
                 name: '不屈意志',
                type: 'buff',
                description: '受到的伤害降低30%',
                duration: 2,
                createdTurn: turn.value,
                effects: [
                    { type: 'damage_reduction', value: 0.30, isPercentage: true }
                ]
             };
             
             if (!player.value.buffs) player.value.buffs = [];
             player.value.buffs.push(buff);
             updateCombatantState(player.value.id, { buffs: player.value.buffs });
             
             const rect = document.body.getBoundingClientRect();
             triggerEffect('spell', rect.width * 0.25, rect.height * 0.6); // Visual
             
             addPopup(player.value, healVal, 'heal');
             addLog(`${player.value.name} 发动【不屈意志】，恢复了 ${healVal} 点生命并获得了伤害减免！`);
             audioManager.playHeal(); 
             
             await sleep(1000);
             checkTurnEnd();
        } else if (skill.id === 'combat_flow') {
             const buff: Buff = {
                 id: `buff_flow_${Date.now()}`,
                 name: '战斗心流',
                type: 'buff',
                description: '攻防提升，闪避提升',
                duration: 3,
                createdTurn: turn.value,
                effects: [
                    { type: 'stat_mod', targetStat: 'attack', value: 0.25, isPercentage: true },
                     { type: 'damage_reduction', value: 0.25, isPercentage: true },
                     { type: 'dodge_mod', value: 0.20, isPercentage: true }
                 ]
             };
             
             if (!player.value.buffs) player.value.buffs = [];
             player.value.buffs.push(buff);
             updateCombatantState(player.value.id, { buffs: player.value.buffs });
             
             const rect = document.body.getBoundingClientRect();
             triggerEffect('spell', rect.width * 0.25, rect.height * 0.6); // Visual
             addLog(`${player.value.name} 进入了【战斗心流】状态！`);
             audioManager.playSpellCast();
             
             await sleep(1000);
             checkTurnEnd();
        }
    } catch (e) {
        console.error('Special action failed:', e);
        addLog(`[错误] 技能发动失败: ${e}`);
    } finally {
        if (phase.value === 'player') {
             isActing.value = false;
        }
    }
}

async function handleTalk() {
  if (!talkInput.value.trim() || !player.value) return;

  // Debug Command: /debug buff
  if (talkInput.value.trim() === '/debug buff') {
      const debugBuff: Buff = {
          id: `debug_${Date.now()}`,
          name: '测试BUFF',
          type: 'buff',
          description: '这是一个用于测试UI显示的BUFF',
          duration: 3,
          createdTurn: turn.value,
          effects: [{ type: 'stat_mod', targetStat: 'attack', value: 0.5, isPercentage: true }]
      };
      if (!player.value.buffs) player.value.buffs = [];
      player.value.buffs.push(debugBuff);
      addPopup(player.value, '测试BUFF', 'buff');
      addLog('已手动添加测试BUFF');
      talkInput.value = '';
      return;
  }
  
  isProcessingTalk.value = true;
  audioManager.playClick();
  
  try {
    const result = await processPersuasion(player.value, enemies.value, allies.value, talkInput.value, turn.value);
    
    // Log Narrative
    addLog(`[嘴遁] ${result.narrative}`);
    
    // Apply Effects
    for (const effect of result.effects) {
       console.log('[HandleTalk] Processing Effect:', effect);

       if (effect.target === 'ally' || effect.target === 'all_allies') {
          // Find targets
          const targets = [];
          if (effect.target === 'ally' && typeof effect.targetIndex === 'number') {
             if (allies.value[effect.targetIndex]) targets.push(allies.value[effect.targetIndex]);
          } else {
             targets.push(...allies.value);
          }
          
          for (const target of targets) {
             if (!target || target.hp <= 0) continue;
             
             if (effect.type === 'heal') {
                 const heal = Number(effect.value) || 0;
                 if (heal > 0) {
                     const newHp = Math.min(target.maxHp, target.hp + heal);
                     target.hp = newHp;
                     updateCombatantState(target.id, { hp: newHp });
                     addPopup(target, heal, 'heal');
                     addLog(`${target.name} 恢复了 ${heal} 点生命！`);
                 }
             } else if (effect.type === 'shield') {
                 const val = Number(effect.value) || 0;
                 if (val > 0) {
                     target.shield = (target.shield || 0) + val;
                     updateCombatantState(target.id, { shield: target.shield });
                     addPopup(target, val, 'buff');
                     addLog(`${target.name} 获得了 ${val} 点护盾！`);
                 }
             } else if (effect.type === 'status' && effect.buffDetails) {
                  if (!target.buffs) target.buffs = [];
                  const newBuff: Buff = {
                      id: `buff_${Date.now()}_${Math.random()}`,
                      name: effect.buffDetails.name,
                      type: 'buff',
                      description: effect.description || effect.buffDetails.name,
                      duration: effect.buffDetails.duration,
                      createdTurn: turn.value,
                      effects: effect.buffDetails.effects.map(e => ({
                          type: e.type,
                          targetStat: e.targetStat,
                          value: e.value,
                          isPercentage: ['stat_mod', 'damage_reduction', 'dodge_mod'].includes(e.type)
                      }))
                  };
                  target.buffs.push(newBuff);
                  updateCombatantState(target.id, { buffs: target.buffs });
                  addPopup(target, newBuff.name, 'buff');
                  addLog(`${target.name} 获得了状态：${newBuff.name}！`);
             }
          }
       } else if (effect.target === 'enemy' || effect.target === 'all_enemies') {
          // Find targets
          const targets = [];
          if (effect.target === 'enemy' && typeof effect.targetIndex === 'number') {
             if (enemies.value[effect.targetIndex]) targets.push(enemies.value[effect.targetIndex]);
          } else {
             targets.push(...enemies.value);
          }
          
          for (const target of targets) {
             if (!target || target.hp <= 0) continue;
             
             if (effect.type === 'damage') {
                const dmg = Number(effect.value) || 0;
                if (dmg > 0) {
                   const newHp = Math.max(0, target.hp - dmg);
                   target.hp = newHp;
                   updateCombatantState(target.id, { hp: newHp });
                   
                   addPopup(target, dmg, 'damage');
                   
                   // Hit Sound & Effect
                   audioManager.playHeavyHit();
                   const rect = document.body.getBoundingClientRect();
                   triggerEffect('hit', rect.width * 0.75, rect.height * 0.4);

                   addLog(`${target.name} 受到了 ${dmg} 点精神伤害！`);
                }
             } else if (effect.type === 'shield') {
                 const val = Number(effect.value) || 0;
                 if (val > 0) {
                     target.shield = (target.shield || 0) + val;
                     updateCombatantState(target.id, { shield: target.shield });
                     addPopup(target, val, 'buff');
                     addLog(`${target.name} 获得了 ${val} 点护盾！`);
                 }
             } else if (effect.type === 'status') {
                 if (effect.buffDetails) {
                    if (!target.buffs) target.buffs = [];
                    const newBuff: Buff = {
                        id: `buff_${Date.now()}_${Math.random()}`,
                        name: effect.buffDetails.name,
                        type: 'buff',
                        description: effect.description || effect.buffDetails.name,
                        duration: effect.buffDetails.duration,
                        createdTurn: turn.value,
                        effects: effect.buffDetails.effects.map(e => ({
                            type: e.type,
                            targetStat: e.targetStat,
                            value: e.value,
                            isPercentage: ['stat_mod', 'damage_reduction', 'dodge_mod'].includes(e.type)
                        }))
                    };
                    target.buffs.push(newBuff);
                    updateCombatantState(target.id, { buffs: target.buffs });
                    addPopup(target, newBuff.name, 'buff');
                    addLog(`${target.name} 获得了状态：${newBuff.name}！`);
                 } else {
                    addPopup(target, String(effect.value), 'buff');
                    addLog(`${target.name} 陷入了 ${effect.value} 状态！`);
                 }
             } else if (effect.type === 'win') {
                 addLog(`${target.name} 失去了战斗意志！`);
                 target.hp = 0; // Force defeat for simplicity
                 updateCombatantState(target.id, { hp: 0 });
                 audioManager.playShatter();
             }
          }
       } else if (effect.target === 'player') {
          if (effect.type === 'heal') {
              const heal = Number(effect.value) || 0;
              if (heal > 0 && player.value) {
                 const newHp = Math.min(player.value.maxHp, player.value.hp + heal);
                 player.value.hp = newHp;
                 updateCombatantState(player.value.id, { hp: newHp });
                 
                 addPopup(player.value, heal, 'heal');
                 addLog(`${player.value.name} 恢复了 ${heal} 点生命！`);
              }
          } else if (effect.type === 'shield') {
              const val = Number(effect.value) || 0;
              if (val > 0 && player.value) {
                  player.value.shield = (player.value.shield || 0) + val;
                  updateCombatantState(player.value.id, { shield: player.value.shield });
                  addPopup(player.value, val, 'buff');
                  addLog(`${player.value.name} 获得了 ${val} 点护盾！`);
              }
          } else if (effect.type === 'status' && effect.buffDetails && player.value) {
               if (!player.value.buffs) player.value.buffs = [];
               const newBuff: Buff = {
                   id: `buff_${Date.now()}_${Math.random()}`,
                   name: effect.buffDetails.name,
                   type: 'buff',
                   description: effect.description || effect.buffDetails.name,
                   duration: effect.buffDetails.duration,
                   createdTurn: turn.value,
                   effects: effect.buffDetails.effects.map(e => ({
                       type: e.type,
                       targetStat: e.targetStat,
                       value: e.value,
                       isPercentage: ['stat_mod', 'damage_reduction', 'dodge_mod'].includes(e.type)
                   }))
               };
               console.log('[HandleTalk] Adding Buff to Player:', newBuff);
               player.value.buffs.push(newBuff);
               updateCombatantState(player.value.id, { buffs: player.value.buffs });
               addPopup(player.value, newBuff.name, 'buff');
               addLog(`${player.value.name} 获得了状态：${newBuff.name}！`);
          } else if (effect.type === 'escape') {
              gameResult.value = 'escape';
              isGameOver.value = true;
              addLog(`${player.value.name} 成功逃脱了！`);
          }
       }
    }
    
    await sleep(2000);
    
    // Deduct AP (Cost 2)
    if (player.value) {
        const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
        updateCombatantState(player.value.id, { actionPoints: Math.max(0, currentAP - 2) });
    }
    
    checkTurnEnd();

  } catch (error) {
    console.error('Talk failed', error);
    addLog('嘴遁失败，由于未知的力量干扰...');
  } finally {
    isProcessingTalk.value = false;
    talkInput.value = '';
    currentMenu.value = 'main';
  }
}

// Target Selection & Execution
async function selectTarget(target: UICombatant) {
  if (!selectionMode.value || !pendingAction.value || isActing.value || phase.value !== 'player') return;
  if (target.hp <= 0) return;
  
  const { type, payload } = pendingAction.value;
  
  // Start Sequence
  isActing.value = true;
  selectionMode.value = false;
  pendingAction.value = null;
  
  try {
      if (type === 'attack') {
         // 1. Wind up
         await sleep(500);

         // 2. Attack Sound & Visual
         audioManager.playSlash();
         const rect = document.body.getBoundingClientRect();
         // Visual target: 70% width (right side), 30% height (top)
         triggerEffect('slash', rect.width * 0.7, rect.height * 0.3);
         
         await sleep(200);

         // 3. Impact
         audioManager.playHeavyHit();
         triggerShake();
         
         if (player.value) {
            await executeAction(player.value, target);
            // Deduct AP (Cost 2)
            const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
            updateCombatantState(player.value.id, { actionPoints: Math.max(0, currentAP - 2) });
         }
         
         if (target.hp <= 0) {
            audioManager.playShatter();
         }
         
         await sleep(1500);
      } else if (type === 'special') {
          // Handle Targeted Special Skills
          const skill = payload;
          if (player.value && skill.id === 'inner_power') {
              // Deduct Costs
              const currentP = player.value.pPoints || 0;
              const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
              
              updateCombatantState(player.value.id, { 
                 pPoints: Math.max(0, currentP - skill.costP),
                 actionPoints: Math.max(0, currentAP - skill.costAP)
              });

              audioManager.playSpellCast();
              const rect = document.body.getBoundingClientRect();
              triggerEffect('spell', rect.width * 0.7, rect.height * 0.3); // Visual on target

              const baseDmg = getBaseDamage(player.value.power);
              const damageMult = 1.2 + Math.random() * 0.3; // 1.2 ~ 1.5
              const trueDmg = Math.round(damageMult * baseDmg);

              // Apply Debuff
              const buff: Buff = {
                  id: `debuff_inner_${Date.now()}`,
                  name: '内伤',
                  type: 'debuff',
                  description: `将在下回合受到 ${trueDmg} 点真实伤害`,
                  duration: 1, // Triggers once at start of next round
                  effects: [
                      { type: 'damage_over_time', value: trueDmg, isPercentage: false }
                  ]
              };

              if (!target.buffs) target.buffs = [];
              target.buffs.push(buff);
              updateCombatantState(target.id, { buffs: target.buffs });

              addPopup(target, '内伤', 'debuff');
              addLog(`${player.value.name} 对 ${target.name} 施加了【内伤】！`);
              
              await sleep(1000);
          }
          
          // Targeted special skills (like Inner Power) logic ends here
          // checkTurnEnd() will be called at the end of selectTarget
      } else if (type === 'spell') {
          // Single Target Spell
          const spell = payload as SpellCard;
          if (player.value) {
              // Ultimate Cut-in
              if (spell.isUltimate) await playUltimateAnimation(player.value, spell.name);

              const newMp = player.value.mp - spell.cost;
              player.value.mp = newMp;
              updateCombatantState(player.value.id, { mp: newMp });
              
              audioManager.playSpellCast();
              const rect = document.body.getBoundingClientRect();
              
              if (spell.isUltimate) {
                   triggerEffect('ultimate_impact', rect.width * 0.5, rect.height * 0.5);
                   setTimeout(() => audioManager.playShatter(), 200);
                   await sleep(2500);
               } else {
                   triggerEffect('spell', rect.width * 0.7, rect.height * 0.3); // Target area
                   await sleep(2200);
               }
              
              triggerShake();
              audioManager.playHeavyHit();
              
              // Execute Damage
              // Use spell.damage + power bonus?
              const dmg = spell.damage; // Simplified
              const newHp = Math.max(0, target.hp - dmg);
              target.hp = newHp;
              updateCombatantState(target.id, { hp: newHp });
              
              addPopup(target, dmg, 'damage');
              
              // Hit Spark
              triggerEffect('hit', rect.width * 0.75, rect.height * 0.4);

              addLog(`${player.value.name} 释放了符卡 ${spell.name}，对 ${target.name} 造成了 ${dmg} 点伤害！`);
              
              // Apply Debuffs (if any)
              if (spell.buffDetails) {
                  applyBuff(target, spell.buffDetails, 'debuff');
              }
              
              if (target.hp <= 0) {
                 audioManager.playShatter();
              }
              
              await sleep(1500);
              
              // Deduct AP (Cost 2)
              const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 2;
              updateCombatantState(player.value.id, { actionPoints: Math.max(0, currentAP - 2) });
          }
      }
      
      // End Player Turn (Replaced by checkTurnEnd)
      checkTurnEnd();
  } catch (error) {
      console.error('Action execution failed:', error);
      addLog(`[错误] 行动失败: ${error}`);
  } finally {
      // IMPORTANT: Reset isActing to allow UI interaction if turn hasn't ended
      // This is now in finally block to ensure it runs
      if (phase.value === 'player') {
          isActing.value = false;
      }
  }
}

function checkTurnEnd() {
    if (!player.value) return;
    
    const currentAP = player.value.actionPoints !== undefined ? player.value.actionPoints : 0;
    
    if (currentAP <= 0) {
        checkWinLoss();
        if (!isGameOver.value) {
            isActing.value = false;
            
            // Check for allies
            if (allies.value.length > 0 && allies.value.some(a => a.hp > 0)) {
                phase.value = 'ally';
                processAllyTurn();
            } else {
                if (combatState.value) combatState.value.turn++;
                phase.value = 'enemy';
                processEnemyTurn();
            }
        }
    } else {
        // Allow more actions
        isActing.value = false;
        currentMenu.value = 'main';
        selectionMode.value = false;
    }
}

// Turn Management
function processTurnStart() {
    if (!combatState.value) return;

    // Reset Player AP at start of Player Phase
    if (phase.value === 'player' && player.value) {
        updateCombatantState(player.value.id, { actionPoints: 2 });
    }

    const allCombatants = [player.value, ...enemies.value].filter(c => c !== null) as UICombatant[];
    
    for (const c of allCombatants) {
        if (!c.buffs || c.buffs.length === 0) continue;
        
        const expiredBuffs: Buff[] = [];
        const activeBuffs: Buff[] = [];
        let changed = false;
        
        for (const buff of c.buffs) {
            // Process DoT / HoT Effects
            for (const effect of buff.effects) {
                if (effect.type === 'damage_over_time') {
                    // True Damage Logic (Cannot be dodged)
                     // 1. Shield Logic
                     let damage = Number(effect.value);
                     if (c.shield && c.shield > 0) {
                         if (damage > c.shield) {
                             damage -= c.shield;
                             c.shield = 0;
                             addLog(`${c.name} 的护盾被 ${buff.name} 击碎！`);
                             audioManager.playShatter();
                         } else {
                             c.shield -= damage;
                             damage = 0;
                             // Shield absorbed all
                         }
                         updateCombatantState(c.id, { shield: c.shield });
                     }

                     // 2. Apply to HP
                     if (damage > 0) {
                         const newHp = Math.max(0, c.hp - damage);
                         c.hp = newHp;
                         updateCombatantState(c.id, { hp: newHp });
                         addPopup(c, damage, 'damage');
                         addLog(`${c.name} 受到 ${buff.name} 的持续伤害 ${damage}点！`);
                         
                         if (c.hp <= 0) {
                             audioManager.playShatter(); // Death sound
                         }
                     }
                } else if (effect.type === 'heal') {
                    const heal = Number(effect.value);
                    if (heal > 0) {
                        const newHp = Math.min(c.maxHp, c.hp + heal);
                        c.hp = newHp;
                        updateCombatantState(c.id, { hp: newHp });
                        addPopup(c, heal, 'heal');
                        addLog(`${c.name} 因 ${buff.name} 恢复了 ${heal} 点生命！`);
                    }
                }
            }

            // Duration Logic Optimization:
            // Ensure buffs last for full round cycles by skipping decrement if applied recently
            let shouldDecrement = true;
            if (buff.createdTurn !== undefined && combatState.value) {
                const currentTurn = combatState.value.turn;
                if (c.isPlayer) {
                    // Player buffs created in previous turn (currentTurn - 1) should not decrement yet
                    // This ensures they last for the current turn + future turns
                    if (buff.createdTurn === currentTurn - 1) {
                        shouldDecrement = false;
                    }
                } else {
                    // Enemy buffs created in current turn (Enemy Phase) should not decrement yet
                    if (buff.createdTurn === currentTurn) {
                        shouldDecrement = false;
                    }
                }
            }

            if (shouldDecrement) {
                buff.duration--;
            }

            if (buff.duration <= 0) {
                expiredBuffs.push(buff);
                changed = true;
            } else {
                activeBuffs.push(buff);
                changed = true; // Duration changed
            }
        }
        
        if (changed) {
             c.buffs = activeBuffs;
             updateCombatantState(c.id, { buffs: activeBuffs });
             
             for (const b of expiredBuffs) {
                 // Only log expiration if it wasn't a 1-turn instant effect (optional optimization)
                 if (b.duration < 0) { // It was 0 before decrement? No, duration becomes 0 implies it expires now.
                    // If original duration was 1, it runs once then expires.
                 }
                 addLog(`${c.name} 的状态 【${b.name}】 已失效。`);
             }
        }
    }

    // Check for deaths caused by DoT/Buffs at the start of turn
    checkWinLoss();
}

// Ally Turn Automation
async function processAllyTurn() {
    if (phase.value !== 'ally') return;
    
    console.log('[Combat] Ally turn processing started');
    
    try {
        await sleep(500);
        
        const aliveAllies = allies.value.filter(a => a.hp > 0);
        
        for (const ally of aliveAllies) {
             if (isGameOver.value) break;
             
             // Define Opponents (Enemies)
             const opponents = enemies.value.filter(e => e.hp > 0);
             if (opponents.length === 0) break;

             // Define Friends (Player + Other Allies)
             const friends: UICombatant[] = [];
             if (player.value && player.value.hp > 0) friends.push(player.value);
             friends.push(...allies.value.filter(a => a.id !== ally.id && a.hp > 0));
             // Add self to friends for self-buffs
             friends.push(ally);

             // AI Logic
             let action: 'attack' | 'spell' = 'attack';
             let selectedSpell: SpellCard | undefined;
             let isUltimateTrigger = false;

             console.log(`[Combat AI Ally] ${ally.name} (HP: ${ally.hp}) thinking. Spells available: ${ally.spellCards?.length || 0}`);
             if (ally.spellCards && ally.spellCards.length > 0) {
                 console.log(`[Combat AI Ally] Spell list: ${ally.spellCards.map(s => s.name).join(', ')}`);
             }

             // 1. Ultimate Trigger Check (HP < 40%)
             if (ally.hp < ally.maxHp * 0.4 && !ally.hasUsedUltimate) {
                 const ult = ally.spellCards?.find(s => s.isUltimate);
                 if (ult) {
                     selectedSpell = ult;
                     action = 'spell';
                     isUltimateTrigger = true;
                 }
             }

             // 2. Regular AI (60% Attack, 40% Spell)
             if (!selectedSpell) {
                 if (ally.spellCards && ally.spellCards.length > 0 && Math.random() < 0.40) {
                     // Use random non-ultimate spell
                     const regularSpells = ally.spellCards.filter(s => !s.isUltimate);
                     if (regularSpells.length > 0) {
                         selectedSpell = regularSpells[Math.floor(Math.random() * regularSpells.length)];
                         action = 'spell';
                     }
                 }
             }

             // 3. Target Selection
             let targets: UICombatant[] = [];
             
             if (action === 'spell' && selectedSpell) {
                 const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
                 const pool = isSupport ? friends : opponents;
                 
                 if (pool.length > 0) {
                     if (selectedSpell.scope === 'aoe') {
                         targets = pool;
                     } else {
                         const t = pool[Math.floor(Math.random() * pool.length)];
                         if (t) targets = [t];
                     }
                 }
             } else {
                 // Attack
                 if (opponents.length > 0) {
                    const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
                    if (randomOpponent) targets = [randomOpponent];
                }
             }

             if (targets.length === 0) continue;

             // 4. Execution
             if (action === 'spell' && selectedSpell) {
                 addLog(`${ally.name} 发动了符卡：${selectedSpell.name}！`);
                 
                 if (isUltimateTrigger) {
                    updateCombatantState(ally.id, { hasUsedUltimate: true });
                    await playUltimateAnimation(ally, selectedSpell.name);
                } else {
                    await playSkillAnimation(ally, selectedSpell.name);
                }

                 audioManager.playSpellCast();
                 
                 // Visuals
                 const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
                 const rect = document.body.getBoundingClientRect();
                 
                 if (isUltimateTrigger) {
                     if (isSupport) {
                         // Center on self/allies (Left side)
                         triggerEffect('spell', rect.width * 0.25, rect.height * 0.5);
                     } else {
                         // Center on enemies (Right side)
                         triggerEffect('spell', rect.width * 0.75, rect.height * 0.5);
                     }
                 }
                 
                 await sleep(isUltimateTrigger ? 1500 : 300);
                 if (!isSupport) {
                    triggerShake();
                    audioManager.playHeavyHit();
                 }

                 // Apply to all targets
                 for (const target of targets) {
                     await executeAction(ally, target, selectedSpell.name, selectedSpell);
                 }

             } else {
                 // Regular Attack
                 const target = targets[0];
                 if (!target) continue;
                 audioManager.playSlash(); 
                 const rect = document.body.getBoundingClientRect();
                 triggerEffect('slash', rect.width * 0.7, rect.height * 0.3); 
                 
                 await sleep(300);
                 triggerShake();
                 audioManager.playHeavyHit();
                 
                 await executeAction(ally, target, '普通攻击');
             }
             
             await sleep(500);
             checkWinLoss();
        }
        
        if (!isGameOver.value) {
             if (combatState.value) combatState.value.turn++;
             phase.value = 'enemy';
             processEnemyTurn();
        }
        
    } catch (e) {
        console.error('[Combat] Ally turn error:', e);
        // Fallback to enemy phase
        phase.value = 'enemy';
        processEnemyTurn();
    }
}

// Enemy Turn Automation
async function processEnemyTurn() {
    if (phase.value !== 'enemy') return;
    
    console.log('[Combat] Enemy turn processing started');
    
    try {
        // Simulate thinking
        await sleep(800);
        
        const aliveEnemies = enemies.value.filter(e => e.hp > 0);
        
        for (const enemy of aliveEnemies) {
            try {
                if (isGameOver.value) break;
                
                // Define Opponents (Player + Allies)
                const opponents: UICombatant[] = [];
                if (player.value && player.value.hp > 0) opponents.push(player.value);
                opponents.push(...allies.value.filter(a => a.hp > 0));
                
                if (opponents.length === 0) break;

                // Define Friends (Self + Other Enemies)
                const friends = [enemy, ...enemies.value.filter(e => e.id !== enemy.id && e.hp > 0)];

                // AI Logic
                let action: 'attack' | 'spell' = 'attack';
                let selectedSpell: SpellCard | undefined;
                let isUltimateTrigger = false;

                console.log(`[Combat AI Enemy] ${enemy.name} (HP: ${enemy.hp}) thinking. Spells available: ${enemy.spellCards?.length || 0}`);
                if (enemy.spellCards && enemy.spellCards.length > 0) {
                    console.log(`[Combat AI Enemy] Spell list: ${enemy.spellCards.map(s => s.name).join(', ')}`);
                }

                // 1. Ultimate Trigger Check (HP < 40%)
                if (enemy.hp < enemy.maxHp * 0.4 && !enemy.hasUsedUltimate) {
                    const ult = enemy.spellCards?.find(s => s.isUltimate);
                    if (ult) {
                        selectedSpell = ult;
                        action = 'spell';
                        isUltimateTrigger = true;
                    }
                }

                // 2. Regular AI (60% Attack, 40% Spell)
                if (!selectedSpell) {
                    if (enemy.spellCards && enemy.spellCards.length > 0 && Math.random() < 0.40) {
                        const regularSpells = enemy.spellCards.filter(s => !s.isUltimate);
                        if (regularSpells.length > 0) {
                            selectedSpell = regularSpells[Math.floor(Math.random() * regularSpells.length)];
                            action = 'spell';
                        }
                    }
                }

                // 3. Target Selection
                let targets: UICombatant[] = [];
                
                if (action === 'spell' && selectedSpell) {
                    const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
                    const pool = isSupport ? friends : opponents;
                    
                    if (pool.length > 0) {
                        if (selectedSpell.scope === 'aoe') {
                            targets = pool;
                        } else {
                            const randomTarget = pool[Math.floor(Math.random() * pool.length)];
                            if (randomTarget) targets = [randomTarget];
                        }
                    }
                } else {
                    // Attack
                    if (opponents.length > 0) {
                        const randomOpponent = opponents[Math.floor(Math.random() * opponents.length)];
                        if (randomOpponent) targets = [randomOpponent];
                    }
                }

                if (targets.length === 0) continue;

                // 4. Execution
                if (action === 'spell' && selectedSpell) {
                     addLog(`${enemy.name} 发动了符卡：${selectedSpell.name}！`);
                     
                     if (isUltimateTrigger) {
                         updateCombatantState(enemy.id, { hasUsedUltimate: true });
                         await playUltimateAnimation(enemy, selectedSpell.name);
                     } else {
                         await playSkillAnimation(enemy, selectedSpell.name);
                     }

                     if (isUltimateTrigger) audioManager.playSpellCast();
                     
                     // Visuals
                     const isSupport = ['heal', 'buff', 'shield'].includes(selectedSpell.type || '');
                     const rect = document.body.getBoundingClientRect();
                     
                     if (isUltimateTrigger) {
                         if (isSupport) {
                             // Center on self/enemies (Right side)
                             triggerEffect('spell', rect.width * 0.75, rect.height * 0.5);
                         } else {
                             // Center on player/allies (Left side)
                             triggerEffect('spell', rect.width * 0.25, rect.height * 0.5);
                         }
                     }

                     await sleep(isUltimateTrigger ? 1500 : 300);
                     if (!isSupport) {
                        triggerShake();
                        audioManager.playHeavyHit();
                     }
                     
                     // Execute for all targets
                     for (const target of targets) {
                         await executeAction(enemy, target, selectedSpell.name, selectedSpell);
                     }
                } else {
                    // Regular Attack
                    const target = targets[0];
                    if (!target) continue;
                    
                    audioManager.playSlash();
                    const rect = document.body.getBoundingClientRect();
                    
                    // Visual on target side
                    const isTargetPlayer = target.isPlayer || target.team === 'player';
                    const tx = isTargetPlayer ? rect.width * 0.25 : rect.width * 0.75;
                    const ty = isTargetPlayer ? rect.height * 0.6 : rect.height * 0.7;

                    triggerEffect('enemy', tx, ty); 
                    
                    await sleep(200);
                    triggerShake();
                    audioManager.playHeavyHit();
                    
                    await executeAction(enemy, target);
                }

            } catch (err) {
                console.error(`Error during enemy ${enemy.name} turn:`, err);
                addLog(`[系统] ${enemy.name} 行动出错，已跳过。`);
            }
            
            await sleep(500);
            checkWinLoss();
        }
        
        if (!isGameOver.value) {
            console.log('[Combat] Enemy turn finished, switching to player');
            phase.value = 'player';
            processTurnStart();
        }
    } catch (e) {
        console.error('[Combat] Critical error in processEnemyTurn:', e);
        addLog('[系统] 敌方回合发生严重错误，强制结束。');
        phase.value = 'player';
    }
}

function checkWinLoss() {
  if (enemies.value.every(e => e.hp <= 0)) {
    isGameOver.value = true;
    gameResult.value = 'win';
  } else if (player.value && player.value.hp <= 0) {
    isGameOver.value = true;
    gameResult.value = 'loss';
  }
}

function closeCombat() {
  const finalCombatants = combatState.value?.combatants || [];

  audioManager.stopBgm();

  // Sync Player
  if (player.value) {
    gameStore.updatePlayer({ hp: player.value.hp, mp: player.value.mp });
  }

  // Sync Enemies
  for (const enemy of enemies.value) {
     if (enemy.id && gameStore.state.npcs[enemy.id]) {
        gameStore.applyAction({
           type: 'UPDATE_NPC', npcId: enemy.id, field: 'hp', op: 'set', value: Math.max(0, enemy.hp)
        });
     }
  }

  // Generate Summary
  const logsText = combatState.value?.logs
      .map(l => `[第${l.turn}回合] ${l.description}`)
      .join('\n') || '（无战斗记录）';

  const resultSummary = `战斗结束。结果：${gameResult.value === 'win' ? '胜利' : '失败'}。` +
    `剩余HP: ${player.value?.hp}。\n\n【战斗日志】\n${logsText}`;

  gameStore.updateState({
    system: {
      ...gameStore.state.system,
      minigame_triggered: true,
      minigame_result: resultSummary,
      combat: null 
    }
  });

  gameLoop.handleCombatCompletion(resultSummary, finalCombatants);
}

</script>

<style scoped>
/* Copied styles from CombatSandbox */
.radial-speed-lines {
  background: repeating-conic-gradient(
    from 0deg,
    transparent 0deg,
    transparent 2deg,
    rgba(255, 255, 255, 0.5) 2.5deg,
    transparent 3deg
  );
  mask-image: radial-gradient(circle, transparent 30%, black 100%);
  -webkit-mask-image: radial-gradient(circle, transparent 30%, black 100%);
}

.clip-hexagon { clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); }
.clip-diamond { clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%); }
.clip-pentagon { clip-path: polygon(0 0, 100% 0, 80% 100%, 20% 100%); }
.clip-pentagon-core { clip-path: polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%); }
.clip-wedge {
   /* Changed to square as requested */
   clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%);
}

.clip-rect-left {
  clip-path: polygon(10% 0, 100% 0, 100% 100%, 0% 100%);
}

.animate-slide-in-right {
  animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideInRight {
  from { transform: translateX(50px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.clip-shard-diag-1 { clip-path: polygon(100% 0, 0 0, 0 100%); }
.clip-shard-diag-2 { clip-path: polygon(100% 0, 0 0, 100% 100%); }
.clip-hud-left { clip-path: polygon(0 0, 100% 0, 85% 100%, 0 100%); }
.clip-hud-right { clip-path: polygon(15% 0, 100% 0, 100% 100%, 0 100%); }

/* Intro Split Screen */
.clip-split-left { clip-path: polygon(0 0, 70% 0, 30% 100%, 0 100%); }
.clip-split-right { clip-path: polygon(70% 0, 100% 0, 100% 100%, 30% 100%); }

.animate-bg-slide-left { animation: bgSlideLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.animate-bg-slide-right { animation: bgSlideRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.animate-char-slide-left { animation: charSlideLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s backwards; }
.animate-char-slide-right { animation: charSlideRight 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.4s backwards; }
.animate-slam { animation: slam 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 1.2s backwards; }
.animate-flash-out { animation: flashOut 3.5s ease-out forwards; }
.animate-pulse-fast { animation: pulse 0.1s infinite; }

.drop-shadow-white { text-shadow: 4px 4px 0px rgba(255,255,255,1); }
.drop-shadow-red { text-shadow: 4px 4px 0px rgba(220,38,38,1); }

.animate-float { animation: float 6s ease-in-out infinite; }
.animate-float-delayed { animation: float 6s ease-in-out infinite 3s; }
.animate-pulse-slow { animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
.animate-slash { animation: slash 0.3s ease-out forwards; }
.animate-flash-fade { animation: flashFade 0.3s ease-out forwards; }
.animate-spell-burst { animation: spellBurst 1s ease-out forwards; }
.animate-damage-pop { animation: damagePop 0.8s cubic-bezier(0.2, 0.9, 0.3, 1) forwards; }
.animate-shatter-1 { animation: shatter1 2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.animate-shatter-2 { animation: shatter2 2s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.animate-bounce-in { animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55) forwards; }

@keyframes shake {
  10%, 90% { transform: translate3d(-10px, -5px, 0); }
  20%, 80% { transform: translate3d(10px, 5px, 0); }
  30%, 50%, 70% { transform: translate3d(-15px, 5px, 0); }
  40%, 60% { transform: translate3d(15px, -5px, 0); }
}

@keyframes slash {
  0% { transform: scale(0) rotate(45deg); opacity: 0; }
  50% { transform: scale(1.5) rotate(45deg); opacity: 1; }
  100% { transform: scale(1) rotate(45deg); opacity: 0; }
}

@keyframes flashFade {
  0% { opacity: 1; filter: brightness(2); }
  100% { opacity: 0; }
}

@keyframes spellBurst {
  0% { transform: scale(0); opacity: 0; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}

@keyframes damagePop {
  0% { transform: translate(-50%, 0) scale(0.5); opacity: 0; }
  20% { transform: translate(-50%, -40px) scale(1.5); opacity: 1; }
  100% { transform: translate(-50%, -100px) scale(1); opacity: 0; }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

/* New Spell Effect Animations */
.clip-triangle { clip-path: polygon(50% 0%, 0% 100%, 100% 100%); }
.animate-spin-slow { animation: spin 8s linear infinite; }
.animate-spin-reverse-slow { animation: spin 12s linear infinite reverse; }
.animate-ping-slow { animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
.animate-fade-in-fast { animation: fadeIn 0.2s ease-out forwards; }
.animate-scale-in-elastic { animation: scaleInElastic 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes ping {
  75%, 100% { transform: scale(2); opacity: 0; }
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleInElastic {
  0% { transform: scale(0); opacity: 0; }
  60% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes shatter1 {
  0% { transform: translate(0, 0) rotate(0); opacity: 1; }
  100% { transform: translate(-100px, -50px) rotate(-45deg); opacity: 0; }
}
@keyframes shatter2 {
  0% { transform: translate(0, 0) rotate(0); opacity: 1; }
  100% { transform: translate(100px, 50px) rotate(45deg); opacity: 0; }
}

@keyframes bounceIn {
  0% { transform: scale(0.5); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); }
}

@keyframes bgSlideLeft {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}
@keyframes bgSlideRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
@keyframes charSlideLeft {
  from { transform: translateX(-100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes charSlideRight {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes slam {
  0% { transform: scale(3) rotate(-20deg); opacity: 0; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
@keyframes flashOut {
  0% { opacity: 1; }
  10% { opacity: 0; }
  90% { opacity: 0; }
  100% { opacity: 0.5; } /* Slight fade back for transition? No, better 0 */
}
/* Override flashOut for clean fade */
@keyframes flashOut {
  0% { opacity: 1; }
  15% { opacity: 0; }
  85% { opacity: 0; }
  100% { opacity: 1; } /* Wait, this is overlay on top? */
}
/* Correction: The flash overlay starts white (opacity 1) then fades to 0 immediately? 
   No, we want a flash at start? Or flash at end?
   Usually: 
   1. Intro starts -> Screen White -> Fades to VS scene.
   2. VS Scene plays.
   3. Transition to Combat -> Screen White -> Fades to Combat.
   
   Let's keep it simple: 
   Flash Out (Start): White -> Transparent
*/
@keyframes flashOut {
  0% { opacity: 1; }
  20% { opacity: 0; }
  100% { opacity: 0; }
}

.intro-fade-enter-active,
.intro-fade-leave-active {
  transition: opacity 0.5s ease;
}

.intro-fade-enter-from,
.intro-fade-leave-to {
  opacity: 0;
}

.perspective-1000 { perspective: 1000px; }
.transform-style-3d { transform-style: preserve-3d; }
.font-display { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }

/* Custom Scrollbar for HUD logs if needed */
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2); }
.custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(239, 68, 68, 0.3); border-radius: 3px; }

/* Log Transitions */
.log-fade-enter-active,
.log-fade-leave-active {
  transition: all 0.5s ease;
}
.log-fade-enter-from {
  opacity: 0;
  transform: translateX(-20px);
}
.log-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
.mask-image-fade {
  mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 60%, transparent 100%);
}

.animate-portrait-move {
  animation: portraitMove 3s ease-out forwards;
}
@keyframes portraitMove {
  0% { transform: scale(1); filter: brightness(1); }
  15% { transform: scale(1.05); filter: brightness(1.5) contrast(1.2); }
  100% { transform: scale(1.2); filter: brightness(1); }
}

.animate-slide-in-left {
  animation: slideInLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes slideInLeft {
  from { transform: translateX(-50px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* --- New Combat Effects --- */

/* 1. Slash Combo - P5 Style */
.clip-starburst { clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); }
.clip-jagged-slash-1 { clip-path: polygon(0% 20%, 20% 0%, 100% 40%, 90% 100%, 0% 80%); } 
.clip-jagged-slash-2 { clip-path: polygon(20% 0%, 80% 0%, 100% 80%, 40% 100%, 0% 20%); }

.animate-slash-combo-1 { animation: slashCombo1 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.animate-slash-combo-2 { animation: slashCombo2 0.4s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards; }
.animate-slash-combo-3 { animation: slashCombo3 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s forwards; }

@keyframes slashCombo1 {
  0% { transform: scale(0) rotate(20deg) translate(-50px, -50px); opacity: 0; }
  30% { transform: scale(1.5) rotate(20deg) translate(0, 0); opacity: 1; }
  100% { transform: scale(1.2) rotate(20deg) translate(20px, 20px); opacity: 0; }
}
@keyframes slashCombo2 {
  0% { transform: scale(0) rotate(-20deg) translate(50px, -50px); opacity: 0; }
  30% { transform: scale(1.5) rotate(-20deg) translate(0, 0); opacity: 1; }
  100% { transform: scale(1.2) rotate(-20deg) translate(-20px, 20px); opacity: 0; }
}
@keyframes slashCombo3 {
  0% { transform: scale(0) rotate(0deg); opacity: 0; }
  40% { transform: scale(1.5) rotate(180deg); opacity: 1; }
  100% { transform: scale(2) rotate(180deg); opacity: 0; }
}

/* 2. Talk / Zuidun */
.animate-word-projectile { animation: wordProjectile 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.animate-word-impact { animation: wordImpact 0.3s ease-out forwards; }

@keyframes wordProjectile {
  0% { transform: translateX(-100vw) scale(0.5) rotate(-10deg); opacity: 0; filter: blur(10px); }
  60% { transform: translateX(0) scale(1.2) rotate(0deg); opacity: 1; filter: blur(0); }
  80% { transform: translateX(20px) scale(1) rotate(5deg); }
  100% { transform: translateX(0) scale(1) rotate(0deg); opacity: 0; }
}

/* 3. Ultimate Impact */
.animate-beam-expand { animation: beamExpand 1.5s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
.animate-screen-shatter { animation: screenShatter 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }

@keyframes beamExpand {
  0% { transform: scaleX(0); opacity: 0; }
  10% { transform: scaleX(0.1); opacity: 1; background: white; }
  30% { transform: scaleX(1.5); background: yellow; }
  100% { transform: scaleX(2); opacity: 0; }
}

@keyframes screenShatter {
  0% { transform: translate(0, 0) rotate(0); filter: hue-rotate(0deg); }
  25% { transform: translate(-20px, 20px) rotate(-2deg); filter: hue-rotate(90deg) invert(1); }
  50% { transform: translate(20px, -20px) rotate(2deg); filter: hue-rotate(180deg) invert(0); }
  75% { transform: translate(-10px, -10px) rotate(-1deg); filter: hue-rotate(270deg) invert(1); }
  100% { transform: translate(0, 0) rotate(0); filter: hue-rotate(0deg) invert(0); }
}

/* 4. Hit Spark */
.animate-hit-spark { animation: hitSpark 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes hitSpark {
  0% { transform: scale(0.2) rotate(0deg); opacity: 1; }
  30% { transform: scale(1.8) rotate(45deg); opacity: 1; }
  100% { transform: scale(1.5) rotate(45deg); opacity: 0; }
}

/* List Transitions for Ally Stack */
.list-complete-move,
.list-complete-enter-active,
.list-complete-leave-active {
  transition: all 0.5s cubic-bezier(0.55, 0, 0.1, 1);
}

.list-complete-enter-from,
.list-complete-leave-to {
  opacity: 0;
  transform: translateY(30px) scale(0.9);
}

.list-complete-leave-active {
  position: absolute;
}
</style>
