/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismDefaultParameterId } from '@framework/cubismdefaultparameterid';
import { CubismModelSettingJson } from '@framework/cubismmodelsettingjson';
import {
  BreathParameterData,
  CubismBreath
} from '@framework/effect/cubismbreath';
import { CubismEyeBlink } from '@framework/effect/cubismeyeblink';
import { ICubismModelSetting } from '@framework/icubismmodelsetting';
import { CubismIdHandle } from '@framework/id/cubismid';
import { CubismFramework } from '@framework/live2dcubismframework';
import { CubismMatrix44 } from '@framework/math/cubismmatrix44';
import { CubismUserModel } from '@framework/model/cubismusermodel';
import {
  ACubismMotion,
  BeganMotionCallback,
  FinishedMotionCallback
} from '@framework/motion/acubismmotion';
import { CubismMotion } from '@framework/motion/cubismmotion';
import {
  CubismMotionQueueEntryHandle,
  InvalidMotionQueueEntryHandleValue
} from '@framework/motion/cubismmotionqueuemanager';
import { csmMap } from '@framework/type/csmmap';
import { csmRect } from '@framework/type/csmrectf';
import { csmString } from '@framework/type/csmstring';
import { csmVector } from '@framework/type/csmvector';
import {
  CSM_ASSERT,
  CubismLogError,
  CubismLogInfo
} from '@framework/utils/cubismdebug';

import * as LAppDefine from './lappdefine';
import { LAppPal } from './lapppal';
import { TextureInfo } from './lapptexturemanager';
import { LAppWavFileHandler } from './lappwavfilehandler';
import { CubismMoc } from '@framework/model/cubismmoc';

import { LAppSubdelegate } from './lappsubdelegate';
import { FayAction, FayClient, FayMessage, LipData } from './fayclient';
import {
  resolveActionExpression,
  resolveActionMotion,
  resolveActionMotionNo
} from './live2d-action-adapter';
import { LipSync } from './lipsync';
import { analyzeResponseForMotions, pickWeightedMotion } from '../utils/motion-hints';

enum LoadStep {
  LoadAssets,
  LoadModel,
  WaitLoadModel,
  LoadExpression,
  WaitLoadExpression,
  LoadPhysics,
  WaitLoadPhysics,
  LoadPose,
  WaitLoadPose,
  SetupEyeBlink,
  SetupBreath,
  LoadUserData,
  WaitLoadUserData,
  SetupEyeBlinkIds,
  SetupLipSyncIds,
  SetupLayout,
  LoadMotion,
  WaitLoadMotion,
  CompleteInitialize,
  CompleteSetupModel,
  LoadTexture,
  WaitLoadTexture,
  CompleteSetup
}

interface FayAudioSegment {
  url: string;
  lips: LipData[];
  text: string;
  durationMs: number;
  isFirst: boolean;
  isEnd: boolean;
  streamId: number;
}

/**
 * ユーザーが実際に使用するモデルの実装クラス<br>
 * モデル生成、機能コンポーネント生成、更新処理とレンダリングの呼び出しを行う。
 */
export class LAppModel extends CubismUserModel {
  /**
   * model3.jsonが置かれたディレクトリとファイルパスからモデルを生成する
   * @param dir
   * @param fileName
   */
  public loadAssets(dir: string, fileName: string): void {
    this._modelHomeDir = dir;

    fetch(`${this._modelHomeDir}${fileName}`)
      .then(response => response.arrayBuffer())
      .then(arrayBuffer => {
        const setting: ICubismModelSetting = new CubismModelSettingJson(
          arrayBuffer,
          arrayBuffer.byteLength
        );

        // ステートを更新
        this._state = LoadStep.LoadModel;

        // 結果を保存
        this.setupModel(setting);
      })
      .catch(error => {
        // model3.json読み込みでエラーが発生した時点で描画は不可能なので、setupせずエラーをcatchして何もしない
        CubismLogError(`Failed to load file ${this._modelHomeDir}${fileName}`);
      });
  }

  /**
   * model3.jsonからモデルを生成する。
   * model3.jsonの記述に従ってモデル生成、モーション、物理演算などのコンポーネント生成を行う。
   *
   * @param setting ICubismModelSettingのインスタンス
   */
  private setupModel(setting: ICubismModelSetting): void {
    this._updating = true;
    this._initialized = false;

    this._modelSetting = setting;

    // CubismModel
    if (this._modelSetting.getModelFileName() != '') {
      const modelFileName = this._modelSetting.getModelFileName();

      fetch(`${this._modelHomeDir}${modelFileName}`)
        .then(response => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${modelFileName}`
            );
            return new ArrayBuffer(0);
          }
        })
        .then(arrayBuffer => {
          this.loadModel(arrayBuffer, this._mocConsistency);
          this._state = LoadStep.LoadExpression;

          // callback
          loadCubismExpression();
        });

      this._state = LoadStep.WaitLoadModel;
    } else {
      LAppPal.printMessage('Model data does not exist.');
    }

    // Expression
    const loadCubismExpression = (): void => {
      if (this._modelSetting.getExpressionCount() > 0) {
        const count: number = this._modelSetting.getExpressionCount();

        for (let i = 0; i < count; i++) {
          const expressionName = this._modelSetting.getExpressionName(i);
          const expressionFileName =
            this._modelSetting.getExpressionFileName(i);

          fetch(`${this._modelHomeDir}${expressionFileName}`)
            .then(response => {
              if (response.ok) {
                return response.arrayBuffer();
              } else if (response.status >= 400) {
                CubismLogError(
                  `Failed to load file ${this._modelHomeDir}${expressionFileName}`
                );
                // ファイルが存在しなくてもresponseはnullを返却しないため、空のArrayBufferで対応する
                return new ArrayBuffer(0);
              }
            })
            .then(arrayBuffer => {
              const motion: ACubismMotion = this.loadExpression(
                arrayBuffer,
                arrayBuffer.byteLength,
                expressionName
              );

              if (this._expressions.getValue(expressionName) != null) {
                ACubismMotion.delete(
                  this._expressions.getValue(expressionName)
                );
                this._expressions.setValue(expressionName, null);
              }

              this._expressions.setValue(expressionName, motion);

              this._expressionCount++;

              if (this._expressionCount >= count) {
                this._state = LoadStep.LoadPhysics;

                // callback
                loadCubismPhysics();
              }
            });
        }
        this._state = LoadStep.WaitLoadExpression;
      } else {
        this._state = LoadStep.LoadPhysics;

        // callback
        loadCubismPhysics();
      }
    };

    // Physics
    const loadCubismPhysics = (): void => {
      if (this._modelSetting.getPhysicsFileName() != '') {
        const physicsFileName = this._modelSetting.getPhysicsFileName();

        fetch(`${this._modelHomeDir}${physicsFileName}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${physicsFileName}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            this.loadPhysics(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.LoadPose;

            // callback
            loadCubismPose();
          });
        this._state = LoadStep.WaitLoadPhysics;
      } else {
        this._state = LoadStep.LoadPose;

        // callback
        loadCubismPose();
      }
    };

    // Pose
    const loadCubismPose = (): void => {
      if (this._modelSetting.getPoseFileName() != '') {
        const poseFileName = this._modelSetting.getPoseFileName();

        fetch(`${this._modelHomeDir}${poseFileName}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${poseFileName}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            this.loadPose(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlink;

            // callback
            setupEyeBlink();
          });
        this._state = LoadStep.WaitLoadPose;
      } else {
        this._state = LoadStep.SetupEyeBlink;

        // callback
        setupEyeBlink();
      }
    };

    // EyeBlink
    const setupEyeBlink = (): void => {
      if (this._modelSetting.getEyeBlinkParameterCount() > 0) {
        this._eyeBlink = CubismEyeBlink.create(this._modelSetting);
        this._state = LoadStep.SetupBreath;
      }

      // callback
      setupBreath();
    };

    // Breath — 仅胸部呼吸，不动头部，避免头部抽搐
    const setupBreath = (): void => {
      this._breath = CubismBreath.create();

      const breathParameters: csmVector<BreathParameterData> = new csmVector();
      breathParameters.pushBack(
        new BreathParameterData(
          CubismFramework.getIdManager().getId(
            CubismDefaultParameterId.ParamBreath
          ),
          0.3,
          0.3,
          4.0,
          1
        )
      );

      this._breath.setParameters(breathParameters);
      this._state = LoadStep.LoadUserData;

      // callback
      loadUserData();
    };

    // UserData
    const loadUserData = (): void => {
      if (this._modelSetting.getUserDataFile() != '') {
        const userDataFile = this._modelSetting.getUserDataFile();

        fetch(`${this._modelHomeDir}${userDataFile}`)
          .then(response => {
            if (response.ok) {
              return response.arrayBuffer();
            } else if (response.status >= 400) {
              CubismLogError(
                `Failed to load file ${this._modelHomeDir}${userDataFile}`
              );
              return new ArrayBuffer(0);
            }
          })
          .then(arrayBuffer => {
            this.loadUserData(arrayBuffer, arrayBuffer.byteLength);

            this._state = LoadStep.SetupEyeBlinkIds;

            // callback
            setupEyeBlinkIds();
          });

        this._state = LoadStep.WaitLoadUserData;
      } else {
        this._state = LoadStep.SetupEyeBlinkIds;

        // callback
        setupEyeBlinkIds();
      }
    };

    // EyeBlinkIds
    const setupEyeBlinkIds = (): void => {
      const eyeBlinkIdCount: number =
        this._modelSetting.getEyeBlinkParameterCount();

      for (let i = 0; i < eyeBlinkIdCount; ++i) {
        this._eyeBlinkIds.pushBack(
          this._modelSetting.getEyeBlinkParameterId(i)
        );
      }

      this._state = LoadStep.SetupLipSyncIds;

      // callback
      setupLipSyncIds();
    };

    // LipSyncIds
    const setupLipSyncIds = (): void => {
      const lipSyncIdCount = this._modelSetting.getLipSyncParameterCount();

      for (let i = 0; i < lipSyncIdCount; ++i) {
        this._lipSyncIds.pushBack(this._modelSetting.getLipSyncParameterId(i));
      }
      this._state = LoadStep.SetupLayout;

      // callback
      setupLayout();
    };

    // Layout
    const setupLayout = (): void => {
      const layout: csmMap<string, number> = new csmMap<string, number>();

      if (this._modelSetting == null || this._modelMatrix == null) {
        CubismLogError('Failed to setupLayout().');
        return;
      }

      this._modelSetting.getLayoutMap(layout);
      this._modelMatrix.setupFromLayout(layout);
      this._state = LoadStep.LoadMotion;

      // callback
      loadCubismMotion();
    };

    // Motion
    const loadCubismMotion = (): void => {
      this._state = LoadStep.WaitLoadMotion;
      this._model.saveParameters();
      this._allMotionCount = 0;
      this._motionCount = 0;
      const group: string[] = [];

      const motionGroupCount: number = this._modelSetting.getMotionGroupCount();

      console.log(`[LAppModel] ========== 动作组信息 ==========`);
      console.log(`[LAppModel] 动作组总数: ${motionGroupCount}`);

      // モーションの総数を求める
      for (let i = 0; i < motionGroupCount; i++) {
        group[i] = this._modelSetting.getMotionGroupName(i);
        const motionCount = this._modelSetting.getMotionCount(group[i]);
        this._allMotionCount += motionCount;
        console.log(`[LAppModel]   - 动作组 "${group[i]}": ${motionCount}个动作`);
      }

      console.log(`[LAppModel] 动作总数: ${this._allMotionCount}`);
      console.log(`[LAppModel] ================================`);

      // モーションの読み込み
      for (let i = 0; i < motionGroupCount; i++) {
        this.preLoadMotionGroup(group[i]);
      }

      // モーションがない場合
      if (motionGroupCount == 0) {
        this._state = LoadStep.LoadTexture;

        // 全てのモーションを停止する
        this._motionManager.stopAllMotions();

        this._updating = false;
        this._initialized = true;

        this.createRenderer();
        this.setupTextures();
        this.getRenderer().startUp(this._subdelegate.getGlManager().getGl());
      }
    };
  }

  /**
   * テクスチャユニットにテクスチャをロードする
   */
  private setupTextures(): void {
    // iPhoneでのアルファ品質向上のためTypescriptではpremultipliedAlphaを採用
    const usePremultiply = true;

    if (this._state == LoadStep.LoadTexture) {
      // テクスチャ読み込み用
      const textureCount: number = this._modelSetting.getTextureCount();

      for (
        let modelTextureNumber = 0;
        modelTextureNumber < textureCount;
        modelTextureNumber++
      ) {
        // テクスチャ名が空文字だった場合はロード・バインド処理をスキップ
        if (this._modelSetting.getTextureFileName(modelTextureNumber) == '') {
          console.log('getTextureFileName null');
          continue;
        }

        // WebGLのテクスチャユニットにテクスチャをロードする
        let texturePath =
          this._modelSetting.getTextureFileName(modelTextureNumber);
        texturePath = this._modelHomeDir + texturePath;

        // ロード完了時に呼び出すコールバック関数
        const onLoad = (textureInfo: TextureInfo): void => {
          this.getRenderer().bindTexture(modelTextureNumber, textureInfo.id);

          this._textureCount++;

          if (this._textureCount >= textureCount) {
            // ロード完了
            this._state = LoadStep.CompleteSetup;

            // 初始化 Pose 系统（控制手臂A/B变体的可见性，只显示两只手）
            if (this._pose) {
              this._pose.updateParameters(this._model, 0.0);
            }
            // 初始化物理系统
            if (this._physics) {
              this._physics.evaluate(this._model, 0.0);
            }

            // 捕获默认参数状态作为"干净"基准
            const paramCount = this._model.getParameterCount();
            this._defaultParameters = new Float32Array(paramCount);
            for (let i = 0; i < paramCount; i++) {
              this._defaultParameters[i] = this._model.getParameterValueByIndex(i);
            }
            console.log(`[LAppModel] 已保存 ${paramCount} 个默认参数`);
          }
        };

        // 読み込み
        this._subdelegate
          .getTextureManager()
          .createTextureFromPngFile(texturePath, usePremultiply, onLoad);
        this.getRenderer().setIsPremultipliedAlpha(usePremultiply);
      }

      this._state = LoadStep.WaitLoadTexture;
    }
  }

  /**
   * レンダラを再構築する
   */
  public reloadRenderer(): void {
    this.deleteRenderer();
    this.createRenderer();
    this.setupTextures();
  }

  /**
   * 更新
   */
  public update(): void {
    if (this._state != LoadStep.CompleteSetup) return;

    const deltaTimeSeconds: number = LAppPal.getDeltaTime();
    this._userTimeSeconds += deltaTimeSeconds;

    this._dragManager.update(deltaTimeSeconds);
    this._dragX = this._dragManager.getX();
    this._dragY = this._dragManager.getY();

    //--------------------------------------------------------------------------
    // 注意：不使用 saveParameters/loadParameters 循环。
    // 该循环会导致动作参数在帧间残留，造成"四只手"等参数污染。
    // 我们已在下方通过默认参数恢复 + 逐帧绝对设置来管理所有参数状态。

    const isMotionPlaying = !this._motionManager.isFinished();
    const isSpeaking = this._fayAudioPlaying || this._frontendSpeaking;

    if (!isMotionPlaying && !isSpeaking) {
      // ==================================================================
      // 待机状态：平滑回归默认姿态 + 呼吸 + 随机待机手势
      // ==================================================================

      // 检测动作是否刚好在这一帧结束 → 启动平滑过渡
      if (this._previousMotionPlaying) {
        this._returnToDefaultActive = true;
        this._returnToDefaultProgress = 0;
        const paramCount = this._model.getParameterCount();
        if (!this._returnToDefaultFrom || this._returnToDefaultFrom.length < paramCount) {
          this._returnToDefaultFrom = new Float32Array(paramCount);
        }
        for (let i = 0; i < paramCount; i++) {
          this._returnToDefaultFrom[i] = this._model.getParameterValueByIndex(i);
        }
      }

      // 平滑过渡中：lerp 从动作结束姿态 → 默认姿态
      if (this._returnToDefaultActive && this._returnToDefaultFrom) {
        this._returnToDefaultProgress += deltaTimeSeconds / this._returnToDefaultDuration;

        if (this._returnToDefaultProgress >= 1.0) {
          // 过渡完成，精确回到默认值
          this._returnToDefaultActive = false;
          this._returnToDefaultFrom = null;
          if (this._defaultParameters) {
            const count = Math.min(this._model.getParameterCount(), this._defaultParameters.length);
            for (let i = 0; i < count; i++) {
              this._model.setParameterValueByIndex(i, this._defaultParameters[i]);
            }
          }
        } else {
          // easeOutCubic: 先快后慢，自然减速回归
          const t = this._returnToDefaultProgress;
          const eased = 1 - Math.pow(1 - t, 3);
          if (this._defaultParameters) {
            const count = Math.min(this._model.getParameterCount(), this._defaultParameters.length);
            for (let i = 0; i < count; i++) {
              const from = this._returnToDefaultFrom[i];
              const to = this._defaultParameters[i];
              this._model.setParameterValueByIndex(i, from + (to - from) * eased);
            }
          }
        }
      } else if (!this._returnToDefaultActive) {
        // 非过渡状态：保持在默认姿态
        if (this._defaultParameters) {
          const count = Math.min(this._model.getParameterCount(), this._defaultParameters.length);
          for (let i = 0; i < count; i++) {
            this._model.setParameterValueByIndex(i, this._defaultParameters[i]);
          }
        }
      }

      // 手臂姿态：自然下垂（覆盖默认值0，与haru_g_idle动作一致）
      if (this._idParamArmLA) {
        this._model.setParameterValueById(this._idParamArmLA, 1);
        this._model.setParameterValueById(this._idParamArmRA, 1);
        this._model.setParameterValueById(this._idParamArmLB, 0);
        this._model.setParameterValueById(this._idParamArmRB, 0);
      }

      // 叠加微弱的呼吸起伏
      const breathTime = this._userTimeSeconds;
      const breath = Math.sin(breathTime * 0.7) * 0.25;
      this._model.setParameterValueById(this._idParamBreath, breath);

      // 待机动作：使用 Idle 空闲组（haru_g_idle / haru_g_m15）循环播放
      this._idleTimerSeconds -= deltaTimeSeconds;
      if (this._idleTimerSeconds <= 0) {
        // 取消平滑过渡，让新动作直接从当前姿态启动
        this._returnToDefaultActive = false;
        this._returnToDefaultFrom = null;

        // 随机选一个 Idle 组循环动作
        const idleMotionNo = Math.floor(Math.random() * 2); // 0=haru_g_idle, 1=haru_g_m15
        this._currentIdleMotionNo = idleMotionNo;
        this.startMotion(LAppDefine.MotionGroupIdle, idleMotionNo, LAppDefine.PriorityIdle);

        // 12-20 秒后切换到另一个 Idle 动作（随机交替）
        this._idleTimerSeconds = 12 + Math.random() * 8;
      }
    } else if (isMotionPlaying) {
      // 有动作播放中，取消任何进行中的回归过渡
      this._returnToDefaultActive = false;
      this._returnToDefaultFrom = null;

      // Idle 空闲组切换计时器：每隔 12-20 秒交替 haru_g_idle ↔ haru_g_m15
      if (!isSpeaking && this._currentIdleMotionNo >= 0) {
        this._idleTimerSeconds -= deltaTimeSeconds;
        if (this._idleTimerSeconds <= 0) {
          const nextMotionNo = this._currentIdleMotionNo === 0 ? 1 : 0;
          this._currentIdleMotionNo = nextMotionNo;
          this.startMotion(LAppDefine.MotionGroupIdle, nextMotionNo, LAppDefine.PriorityIdle);
          this._idleTimerSeconds = 12 + Math.random() * 8;
        }
      }

      // 更新动作（应用速度缩放，说话动作有 0.85~1.2x 的随机变速）
      this._motionManager.updateMotion(this._model, deltaTimeSeconds * this._motionSpeedScale);
    }
    // 说话中但动作已结束：周期性播放伴随手势，避免僵住
    if (isSpeaking && !isMotionPlaying) {
      this._speakingMotionTimer -= deltaTimeSeconds;
      if (this._speakingMotionTimer <= 0) {
        // 优先用回答语义加权选动作，兜底用导游人设均匀池
        let motionNo: number;
        if (this._speakingMotionScores && this._speakingMotionScores.size > 0) {
          motionNo = pickWeightedMotion(this._speakingMotionScores, this._lastSpeakingMotionNo);
        } else {
          const speakPool = [1, 3, 4, 5, 10, 11, 12, 18, 19, 21, 22, 23, 24];
          const candidates = speakPool.filter(m => m !== this._lastSpeakingMotionNo);
          const pool = candidates.length > 0 ? candidates : speakPool;
          motionNo = pool[Math.floor(Math.random() * pool.length)];
        }
        this._lastSpeakingMotionNo = motionNo;

        // 不调用 stopAllMotions，让 SDK 自动交叉淡入淡出（FadeIn/FadeOut 各 0.5s）
        // 随机微调播放速度（0.85x ~ 1.2x），动作更自然
        this._motionSpeedScale = 0.85 + Math.random() * 0.35;
        this.startMotion(LAppDefine.MotionGroupTapBody, motionNo - 1, LAppDefine.PriorityIdle);
        this._speakingMotionTimer = 2 + Math.random() * 2; // 2-4 秒间隔
      }
    } else {
      this._speakingMotionTimer = 2;
      if (!isSpeaking) {
        this._lastSpeakingMotionNo = 0;
        this._motionSpeedScale = 1.0; // 非说话时恢复默认速度
      }
    }

    //--------------------------------------------------------------------------

    // まばたき
    if (this._eyeBlink != null) {
      this._eyeBlink.updateParameters(this._model, deltaTimeSeconds);
    }

    if (this._expressionManager != null) {
      this._expressionManager.updateMotion(this._model, deltaTimeSeconds); // 表情でパラメータ更新（相対変化）
    }

    // ドラッグによる変化
    // ドラッグによる顔の向きの調整
    this._model.addParameterValueById(this._idParamAngleX, this._dragX * 30); // -30から30の値を加える
    this._model.addParameterValueById(this._idParamAngleY, this._dragY * 30);
    this._model.addParameterValueById(
      this._idParamAngleZ,
      this._dragX * this._dragY * -30
    );

    // ドラッグによる体の向きの調整
    this._model.addParameterValueById(
      this._idParamBodyAngleX,
      this._dragX * 10
    ); // -10から10の値を加える

    // ドラッグによる目の向きの調整
    this._model.addParameterValueById(this._idParamEyeBallX, this._dragX); // -1から1の値を加える
    this._model.addParameterValueById(this._idParamEyeBallY, this._dragY);

    // リップシンク（仅在有音频播放时更新）
    if (this._lipSync && this._fayAudioPlaying) {
      this._lipSync.update();
    }

    // 前端口型模拟（由 TouristChat 触发，不依赖 Fay TTS 音频）
    if (this._frontendSpeaking && !this._fayAudioPlaying) {
      let openness: number;
      if (this._ttsAnalyser && this._ttsDataArray) {
        // ===== TTS 音频驱动：真实音量 → 口型 =====
        const dataArray = this._ttsDataArray as unknown as Uint8Array<ArrayBuffer>;
        this._ttsAnalyser.getByteTimeDomainData(dataArray);
        // 计算 RMS 音量 (0~1)
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / this._ttsDataArray.length);
        // 音量映射到口型开合度，带平滑
        const targetOpen = Math.min(0.85, rms * 2.5);
        const currentOpen = this._model.getParameterValueById(this._idParamMouthOpenY);
        openness = currentOpen + (targetOpen - currentOpen) * Math.min(1, deltaTimeSeconds * 12);
      } else {
        // ===== 无音频时：语音节奏模拟 =====
        this._mouthPhase += deltaTimeSeconds;
        if (this._mouthPhase >= this._mouthSyllableDuration) {
          this._mouthPhase -= this._mouthSyllableDuration;
          this._mouthSyllableDuration = 0.10 + Math.random() * 0.22;
          this._mouthTarget = 0.15 + Math.random() * 0.55;
          if (Math.random() < 0.08) {
            this._mouthTarget = 0; // 偶尔停顿
            this._mouthSyllableDuration = 0.08 + Math.random() * 0.12;
          }
        }
        const currentOpen = this._model.getParameterValueById(this._idParamMouthOpenY);
        openness = currentOpen + (this._mouthTarget - currentOpen) * Math.min(1, deltaTimeSeconds * 10);
      }
      this._model.setParameterValueById(this._idParamMouthOpenY, openness);
    }

    // 记录本帧动作状态，供下一帧检测动作结束边界
    this._previousMotionPlaying = isMotionPlaying;

    // Pose 系统：控制手臂A/B变体可见性，确保只显示两只手
    if (this._pose) {
      this._pose.updateParameters(this._model, deltaTimeSeconds);
    }
    // 物理演算更新
    if (this._physics) {
      this._physics.evaluate(this._model, deltaTimeSeconds);
    }

    this._model.update();
  }

  /**
   * 引数で指定したモーションの再生を開始する
   * @param group モーショングループ名
   * @param no グループ内の番号
   * @param priority 優先度
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
   */
  public startMotion(
    group: string,
    no: number,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
    onBeganMotionHandler?: BeganMotionCallback
  ): CubismMotionQueueEntryHandle {
    if (priority == LAppDefine.PriorityForce) {
      this._motionManager.setReservePriority(priority);
      console.log(`[LAppModel] 使用强制优先级: ${priority}`);
    } else if (!this._motionManager.reserveMotion(priority)) {
      // ========== 优先级不足，无法启动动作 ==========
      console.error(`[LAppModel] ❌ 优先级不足，无法启动动作: priority=${priority}, group="${group}", no=${no}`);
      if (this._debugMode) {
        LAppPal.printMessage("[APP]can't start motion.");
      }
      return InvalidMotionQueueEntryHandleValue;
    } else {
      console.log(`[LAppModel] ✓ 优先级保留成功: priority=${priority}`);
    }

    // 非 Idle 组的动作标记为非 idle 状态，防止 Idle 切换计时器干扰
    if (group !== LAppDefine.MotionGroupIdle) {
      this._currentIdleMotionNo = -1;
    }

    // ========== 验证动作编号范围 ==========
    const motionCount = this._modelSetting.getMotionCount(group);
    if (no < 0 || no >= motionCount) {
      CubismLogError(
        `[LAppModel] 动作编号超出范围: group="${group}", no=${no}, 总数=${motionCount}`
      );
      return InvalidMotionQueueEntryHandleValue;
    }

    const motionFileName = this._modelSetting.getMotionFileName(group, no);

    // ex) idle_0
    const name = `${group}_${no}`;
    let motion: CubismMotion = this._motions.getValue(name) as CubismMotion;
    let autoDelete = false;

    if (motion == null) {
      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then(response => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`
            );
            return new ArrayBuffer(0);
          }
        })
        .then(arrayBuffer => {
          // ========== 检查buffer是否有效 ==========
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            CubismLogError(
              `[LAppModel] 动作文件为空或加载失败: ${motionFileName}`
            );
            this._motionManager.setReservePriority(LAppDefine.PriorityNone);
            return;
          }

          motion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            null,
            onFinishedMotionHandler,
            onBeganMotionHandler,
            this._modelSetting,
            group,
            no,
            this._motionConsistency
          );
        });

      if (motion) {
        motion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);
        autoDelete = true; // 終了時にメモリから削除
      } else {
        CubismLogError("Can't start motion {0} .", motionFileName);
        // ロードできなかったモーションのReservePriorityをリセットする
        this._motionManager.setReservePriority(LAppDefine.PriorityNone);
        return InvalidMotionQueueEntryHandleValue;
      }
    } else {
      motion.setBeganMotionHandler(onBeganMotionHandler);
      motion.setFinishedMotionHandler(onFinishedMotionHandler);
    }

    //voice
    const voice = this._modelSetting.getMotionSoundFileName(group, no);
    if (voice.localeCompare('') != 0) {
      let path = voice;
      path = this._modelHomeDir + path;
      this._wavFileHandler.start(path);
    }

    if (this._debugMode) {
      LAppPal.printMessage(`[APP]start motion: [${group}_${no}]`);
    }

    console.log(`[LAppModel] 调用 motionManager.startMotionPriority: group="${group}", no=${no}, priority=${priority}, autoDelete=${autoDelete}`);
    const motionHandle = this._motionManager.startMotionPriority(
      motion,
      autoDelete,
      priority
    );
    console.log(`[LAppModel] startMotionPriority 返回: ${motionHandle} ${motionHandle === InvalidMotionQueueEntryHandleValue ? '(失败-1)' : '(成功)'}`);

    return motionHandle;
  }

  /**
   * ランダムに選ばれたモーションの再生を開始する。
   * @param group モーショングループ名
   * @param priority 優先度
   * @param onFinishedMotionHandler モーション再生終了時に呼び出されるコールバック関数
   * @return 開始したモーションの識別番号を返す。個別のモーションが終了したか否かを判定するisFinished()の引数で使用する。開始できない時は[-1]
   */
  public startRandomMotion(
    group: string,
    priority: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
    onBeganMotionHandler?: BeganMotionCallback
  ): CubismMotionQueueEntryHandle {
    if (this._modelSetting.getMotionCount(group) == 0) {
      return InvalidMotionQueueEntryHandleValue;
    }

    const no: number = Math.floor(
      Math.random() * this._modelSetting.getMotionCount(group)
    );

    return this.startMotion(
      group,
      no,
      priority,
      onFinishedMotionHandler,
      onBeganMotionHandler
    );
  }

  /**
   * 引数で指定した表情モーションをセットする
   *
   * @param expressionId 表情モーションのID
   */
  public setExpression(expressionId: string): void {
    const motion: ACubismMotion = this._expressions.getValue(expressionId);

    if (this._debugMode) {
      LAppPal.printMessage(`[APP]expression: [${expressionId}]`);
    }

    if (motion != null) {
      this._expressionManager.startMotion(motion, false);
    } else {
      if (this._debugMode) {
        LAppPal.printMessage(`[APP]expression[${expressionId}] is null`);
      }
    }
  }

  /**
   * ランダムに選ばれた表情モーションをセットする
   */
  public setRandomExpression(): void {
    if (this._expressions.getSize() == 0) {
      return;
    }

    const no: number = Math.floor(Math.random() * this._expressions.getSize());

    for (let i = 0; i < this._expressions.getSize(); i++) {
      if (i == no) {
        const name: string = this._expressions._keyValues[i].first;
        this.setExpression(name);
        return;
      }
    }
  }

  /**
   * イベントの発火を受け取る
   */
  public motionEventFired(eventValue: csmString): void {
    CubismLogInfo('{0} is fired on LAppModel!!', eventValue.s);
  }

  /**
   * 当たり判定テスト
   * 指定ＩＤの頂点リストから矩形を計算し、座標をが矩形範囲内か判定する。
   *
   * @param hitArenaName  当たり判定をテストする対象のID
   * @param x             判定を行うX座標
   * @param y             判定を行うY座標
   */
  public hitTest(hitArenaName: string, x: number, y: number): boolean {
    // 透明時は当たり判定無し。
    if (this._opacity < 1) {
      return false;
    }

    const count: number = this._modelSetting.getHitAreasCount();

    for (let i = 0; i < count; i++) {
      if (this._modelSetting.getHitAreaName(i) == hitArenaName) {
        const drawId: CubismIdHandle = this._modelSetting.getHitAreaId(i);
        return this.isHit(drawId, x, y);
      }
    }

    return false;
  }

  /**
   * モーションデータをグループ名から一括でロードする。
   * モーションデータの名前は内部でModelSettingから取得する。
   *
   * @param group モーションデータのグループ名
   */
  public preLoadMotionGroup(group: string): void {
    for (let i = 0; i < this._modelSetting.getMotionCount(group); i++) {
      const motionFileName = this._modelSetting.getMotionFileName(group, i);

      // ex) idle_0
      const name = `${group}_${i}`;
      if (this._debugMode) {
        LAppPal.printMessage(
          `[APP]load motion: ${motionFileName} => [${name}]`
        );
      }

      fetch(`${this._modelHomeDir}${motionFileName}`)
        .then(response => {
          if (response.ok) {
            return response.arrayBuffer();
          } else if (response.status >= 400) {
            CubismLogError(
              `Failed to load file ${this._modelHomeDir}${motionFileName}`
            );
            return new ArrayBuffer(0);
          }
        })
        .then(arrayBuffer => {
          // ========== 检查buffer是否有效 ==========
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            CubismLogError(
              `[LAppModel] 预加载动作文件为空或加载失败: ${motionFileName}`
            );
            // 减少总动作计数，避免等待永远不会完成的加载
            this._allMotionCount--;
            return;
          }

          const tmpMotion: CubismMotion = this.loadMotion(
            arrayBuffer,
            arrayBuffer.byteLength,
            name,
            null,
            null,
            this._modelSetting,
            group,
            i,
            this._motionConsistency
          );

          if (tmpMotion != null) {
            tmpMotion.setEffectIds(this._eyeBlinkIds, this._lipSyncIds);

            if (this._motions.getValue(name) != null) {
              ACubismMotion.delete(this._motions.getValue(name));
            }

            this._motions.setValue(name, tmpMotion);

            this._motionCount++;
          } else {
            // loadMotionできなかった場合はモーションの総数がずれるので1つ減らす
            this._allMotionCount--;
          }

          if (this._motionCount >= this._allMotionCount) {
            this._state = LoadStep.LoadTexture;

            // 全てのモーションを停止する
            this._motionManager.stopAllMotions();

            this._updating = false;
            this._initialized = true;

            this.createRenderer();
            this.setupTextures();
            this.getRenderer().startUp(
              this._subdelegate.getGlManager().getGl()
            );
          }
        });
    }
  }

  /**
   * すべてのモーションデータを解放する。
   */
  public releaseMotions(): void {
    this._motions.clear();
  }

  /**
   * 全ての表情データを解放する。
   */
  public releaseExpressions(): void {
    this._expressions.clear();
  }

  /**
   * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
   */
  public doDraw(): void {
    if (this._model == null) return;

    // キャンバスサイズを渡す
    const canvas = this._subdelegate.getCanvas();
    const viewport: number[] = [0, 0, canvas.width, canvas.height];

    this.getRenderer().setRenderState(
      this._subdelegate.getFrameBuffer(),
      viewport
    );
    this.getRenderer().drawModel();
  }

  /**
   * モデルを描画する処理。モデルを描画する空間のView-Projection行列を渡す。
   */
  public draw(matrix: CubismMatrix44): void {
    if (this._model == null) {
      return;
    }

    // 各読み込み終了後
    if (this._state == LoadStep.CompleteSetup) {
      matrix.multiplyByMatrix(this._modelMatrix);

      this.getRenderer().setMvpMatrix(matrix);

      this.doDraw();
    }
  }

  public async hasMocConsistencyFromFile() {
    CSM_ASSERT(this._modelSetting.getModelFileName().localeCompare(``));

    // CubismModel
    if (this._modelSetting.getModelFileName() != '') {
      const modelFileName = this._modelSetting.getModelFileName();

      const response = await fetch(`${this._modelHomeDir}${modelFileName}`);
      const arrayBuffer = await response.arrayBuffer();

      this._consistency = CubismMoc.hasMocConsistency(arrayBuffer);

      if (!this._consistency) {
        CubismLogInfo('Inconsistent MOC3.');
      } else {
        CubismLogInfo('Consistent MOC3.');
      }

      return this._consistency;
    } else {
      LAppPal.printMessage('Model data does not exist.');
    }
  }

  public setSubdelegate(subdelegate: LAppSubdelegate): void {
    this._subdelegate = subdelegate;
  }

  /**
   * コンストラクタ
   */
  public constructor() {
    super();

    this._modelSetting = null;
    this._modelHomeDir = null;
    this._userTimeSeconds = 0.0;

    this._eyeBlinkIds = new csmVector<CubismIdHandle>();
    this._lipSyncIds = new csmVector<CubismIdHandle>();

    this._motions = new csmMap<string, ACubismMotion>();
    this._expressions = new csmMap<string, ACubismMotion>();

    this._hitArea = new csmVector<csmRect>();
    this._userArea = new csmVector<csmRect>();

    this._idParamAngleX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleX
    );
    this._idParamAngleY = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleY
    );
    this._idParamAngleZ = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleZ
    );
    this._idParamEyeBallX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamEyeBallX
    );
    this._idParamEyeBallY = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamEyeBallY
    );
    this._idParamBodyAngleX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamBodyAngleX
    );
    this._idParamBreath = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamBreath
    );

    // 手臂姿态控制（A=自然下垂，B=抬起手势）
    this._idParamArmLA = CubismFramework.getIdManager().getId('ParamArmLA');
    this._idParamArmRA = CubismFramework.getIdManager().getId('ParamArmRA');
    this._idParamArmLB = CubismFramework.getIdManager().getId('ParamArmLB');
    this._idParamArmRB = CubismFramework.getIdManager().getId('ParamArmRB');

    // Fay口型同步 / 前端口型模拟
    this._idParamMouthOpenY = CubismFramework.getIdManager().getId('ParamMouthOpenY');

    if (LAppDefine.MOCConsistencyValidationEnable) {
      this._mocConsistency = true;
    }

    if (LAppDefine.MotionConsistencyValidationEnable) {
      this._motionConsistency = true;
    }

    this._state = LoadStep.LoadAssets;
    this._expressionCount = 0;
    this._textureCount = 0;
    this._motionCount = 0;
    this._allMotionCount = 0;
    this._wavFileHandler = new LAppWavFileHandler();
    this._consistency = false;

    // Initialize Fay integration (网页端同步播放音频并驱动口型)
    this._fayClient = null;
    this._lipSync = null;
    this._activeFayAudio = null;
    this._fayAudioQueue = [];
    this._fayAudioPlaying = false;
    this._fayAudioBlockedByAutoplay = false;
    this._fayAudioStreamId = 0;
    this._fayAudioRecoveryTimer = null;
    this._fayAudioUnlockButton = null;
    this._frontendSpeaking = false;
    this._mouthPhase = 0;
    this._mouthTarget = 0;
    this._mouthSyllableDuration = 0.15;
    this._defaultParameters = null;

    // TTS 音频分析
    this._ttsAudioContext = null;
    this._ttsAnalyser = null;
    this._ttsAudioSource = null;
    this._ttsDataArray = null;

    // 待机动作系统：初始 3-6 秒后播放第一个待机动作
    this._idleTimerSeconds = 3 + Math.random() * 3;
    this._nextIdleInterval = 0;
    this._currentIdleMotionNo = -1; // -1=未播放idle, 0=haru_g_idle, 1=haru_g_m15
    this._speakingMotionTimer = 2;  // 说话时手势间隔 2-4 秒
    this._lastSpeakingMotionNo = 0;
    this._motionSpeedScale = 1.0;
    this._speakingMotionScores = null;

    // 平滑回归默认姿态：动作结束时 lerp 过渡，避免僵硬跳变
    this._returnToDefaultActive = false;
    this._returnToDefaultProgress = 0;
    this._returnToDefaultDuration = 0.65; // 过渡时长 0.65 秒
    this._returnToDefaultFrom = null;
    this._previousMotionPlaying = false;
  }

  private _subdelegate: LAppSubdelegate;

  // Fay integration (网页端同步播放音频并驱动口型)
  _fayClient: FayClient | null;
  _lipSync: LipSync | null;
  _activeFayAudio: HTMLAudioElement | null;
  _fayAudioQueue: FayAudioSegment[];
  _fayAudioPlaying: boolean;
  _fayAudioBlockedByAutoplay: boolean;
  _fayAudioStreamId: number;
  _fayAudioRecoveryTimer: number | null;
  _fayAudioUnlockButton: HTMLButtonElement | null;
  _frontendSpeaking: boolean;
  _mouthPhase: number;
  _mouthTarget: number;
  _mouthSyllableDuration: number;
  _defaultParameters: Float32Array | null;

  // TTS 音频分析（Web Audio API 驱动嘴型）
  _ttsAudioContext: AudioContext | null;
  _ttsAnalyser: AnalyserNode | null;
  _ttsAudioSource: MediaElementAudioSourceNode | null;
  _ttsDataArray: Uint8Array | null;

  // 待机动作系统
  _idleTimerSeconds: number;
  _nextIdleInterval: number;
  _currentIdleMotionNo: number; // -1=非idle, 0=haru_g_idle, 1=haru_g_m15
  _speakingMotionTimer: number; // 说话时伴随手势计时器
  _lastSpeakingMotionNo: number; // 上次播放的说话动作编号（去重用）
  _motionSpeedScale: number;     // 动作播放速度缩放（0.85~1.2）
  _speakingMotionScores: Map<number, number> | null; // 回答内容的加权动作分数

  // 平滑回归默认姿态（动作结束 → 默认姿态 lerp）
  _returnToDefaultActive: boolean;
  _returnToDefaultProgress: number;
  _returnToDefaultDuration: number;
  _returnToDefaultFrom: Float32Array | null;
  _previousMotionPlaying: boolean;

  _modelSetting: ICubismModelSetting; // モデルセッティング情報
  _modelHomeDir: string; // モデルセッティングが置かれたディレクトリ
  _userTimeSeconds: number; // デルタ時間の積算値[秒]

  _eyeBlinkIds: csmVector<CubismIdHandle>; // モデルに設定された瞬き機能用パラメータID
  _lipSyncIds: csmVector<CubismIdHandle>; // モデルに設定されたリップシンク機能用パラメータID

  _motions: csmMap<string, ACubismMotion>; // 読み込まれているモーションのリスト
  _expressions: csmMap<string, ACubismMotion>; // 読み込まれている表情のリスト

  _hitArea: csmVector<csmRect>;
  _userArea: csmVector<csmRect>;

  _idParamAngleX: CubismIdHandle; // パラメータID: ParamAngleX
  _idParamAngleY: CubismIdHandle; // パラメータID: ParamAngleY
  _idParamAngleZ: CubismIdHandle; // パラメータID: ParamAngleZ
  _idParamEyeBallX: CubismIdHandle; // パラメータID: ParamEyeBallX
  _idParamEyeBallY: CubismIdHandle; // パラメータID: ParamEyeBAllY
  _idParamBodyAngleX: CubismIdHandle; // パラメータID: ParamBodyAngleX
  _idParamBreath: CubismIdHandle; // パラメータID: ParamBreath
  _idParamMouthOpenY: CubismIdHandle; // パラメータID: ParamMouthOpenY (Fay口型同步)

  _idParamArmLA: CubismIdHandle; // パラメータID: ParamArmLA (左臂A-自然下垂)
  _idParamArmRA: CubismIdHandle; // パラメータID: ParamArmRA (右臂A-自然下垂)
  _idParamArmLB: CubismIdHandle; // パラメータID: ParamArmLB (左臂B-抬起)
  _idParamArmRB: CubismIdHandle; // パラメータID: ParamArmRB (右臂B-抬起)

  _state: LoadStep; // 現在のステータス管理用
  _expressionCount: number; // 表情データカウント
  _textureCount: number; // テクスチャカウント
  _motionCount: number; // モーションデータカウント
  _allMotionCount: number; // モーション総数
  _wavFileHandler: LAppWavFileHandler; //wavファイルハンドラ
  _consistency: boolean; // MOC3整合性チェック管理用

  private handleFayAudioUserGesture = (): void => {
    this.resumeQueuedFayAudio('user-gesture', true);
  };

  private handleFayAudioVisibilityChange = (): void => {
    if (!document.hidden) {
      this.resumeQueuedFayAudio('tab-visible');
    }
  };

  private isAutoplayBlockedError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const maybeError = error as { name?: string; message?: string };
    const name = maybeError.name || '';
    const message = (maybeError.message || '').toLowerCase();

    return (
      name === 'NotAllowedError' ||
      message.includes('user gesture') ||
      message.includes('without a user gesture') ||
      message.includes('play() failed because')
    );
  }

  private handleAudioUnlockButtonClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    this.resumeQueuedFayAudio('unlock-button', true);
  };

  private showAudioUnlockButton(): void {
    if (this._fayAudioUnlockButton) {
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Enable Audio';
    button.style.position = 'fixed';
    button.style.left = '50%';
    button.style.bottom = '24px';
    button.style.transform = 'translateX(-50%)';
    button.style.padding = '10px 16px';
    button.style.border = 'none';
    button.style.borderRadius = '999px';
    button.style.background = '#111';
    button.style.color = '#fff';
    button.style.fontSize = '14px';
    button.style.fontWeight = '600';
    button.style.letterSpacing = '0.2px';
    button.style.zIndex = '99999';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 10px 24px rgba(0,0,0,0.28)';
    button.addEventListener('click', this.handleAudioUnlockButtonClick);
    document.body.appendChild(button);

    this._fayAudioUnlockButton = button;
    console.warn('[LAppModel] 浏览器拦截自动播放，已显示音频解锁按钮');
  }

  private hideAudioUnlockButton(): void {
    if (!this._fayAudioUnlockButton) {
      return;
    }

    this._fayAudioUnlockButton.removeEventListener(
      'click',
      this.handleAudioUnlockButtonClick
    );
    this._fayAudioUnlockButton.remove();
    this._fayAudioUnlockButton = null;
  }

  private resumeQueuedFayAudio(
    reason: string,
    clearAutoplayBlock: boolean = false
  ): void {
    if (clearAutoplayBlock && this._fayAudioBlockedByAutoplay) {
      console.log('[LAppModel] 检测到用户交互，重试网页端音频播放');
      this._fayAudioBlockedByAutoplay = false;
      this.hideAudioUnlockButton();
    }

    if (
      this._fayAudioPlaying &&
      (!this._activeFayAudio || this._activeFayAudio.ended || this._activeFayAudio.error !== null)
    ) {
      console.warn(
        `[LAppModel] 检测到网页端音频状态卡住，重置队列状态: reason=${reason}`
      );
      this.stopActiveFayAudio(false);
    }

    if (this._fayAudioBlockedByAutoplay) {
      console.warn(
        `[LAppModel] 音频队列暂停中：浏览器仍在拦截自动播放，queue=${this._fayAudioQueue.length}, reason=${reason}`
      );
      this.showAudioUnlockButton();
      return;
    }

    if (this._fayAudioPlaying) {
      const audio = this._activeFayAudio;
      console.log(
        `[LAppModel] 音频队列等待当前分片播放完成，queue=${this._fayAudioQueue.length}, reason=${reason}, paused=${audio?.paused ?? 'n/a'}, ended=${audio?.ended ?? 'n/a'}, currentTime=${audio?.currentTime ?? 'n/a'}`
      );
      return;
    }

    if (this._fayAudioQueue.length === 0) {
      return;
    }

    console.log(
      `[LAppModel] 尝试继续播放网页端音频队列，queue=${this._fayAudioQueue.length}, reason=${reason}`
    );
    void this.playNextQueuedFayAudio();
  };

  private queueFayAudio(message: FayMessage): void {
    if (message.Data.Key !== 'audio') {
      return;
    }

    if (!message.Data.HttpValue) {
      if (this._lipSync && message.Data.Lips) {
        this._lipSync.startLipSync(message.Data.Lips);
      }
      return;
    }

    if (message.Data.IsFirst === 1) {
      const wasPlaying = this._fayAudioPlaying;
      this._fayAudioStreamId += 1;
      console.log(
        `[LAppModel] New Fay audio stream started: streamId=${this._fayAudioStreamId}`
      );
      this._fayAudioQueue = [];
      // 不停止idle循环 — 说话动作(PriorityForce)会自动覆盖idle(PriorityIdle)参数
      if (wasPlaying) {
        console.log(
          '[LAppModel] 当前分片仍在播放，新流将等待当前分片结束后接管播放'
        );
      } else {
        this.stopActiveFayAudio(false);
      }
    } else if (this._fayAudioStreamId === 0) {
      this._fayAudioStreamId = 1;
      console.log('[LAppModel] 前端在中途接入音频流，创建默认 streamId=1');
    }

    const lips = message.Data.Lips || [];
    const durationMs = lips.reduce(
      (sum, lip) => sum + lip.Time,
      0
    );

    this._fayAudioQueue.push({
      url: message.Data.HttpValue,
      lips,
      text: message.Data.Text || '',
      durationMs,
      isFirst: message.Data.IsFirst === 1,
      isEnd: message.Data.IsEnd === 1,
      streamId: this._fayAudioStreamId
    });

    console.log(
      `[LAppModel] Audio queued: size=${this._fayAudioQueue.length}, streamId=${this._fayAudioStreamId}, isEnd=${message.Data.IsEnd === 1 ? 1 : 0}, text="${message.Data.Text || ''}"`
    );

    this.resumeQueuedFayAudio('queue');
  }

  private async playNextQueuedFayAudio(): Promise<void> {
    if (this._fayAudioPlaying || this._fayAudioBlockedByAutoplay) {
      return;
    }

    const nextSegment = this._fayAudioQueue.shift();
    if (!nextSegment) {
      return;
    }

    if (nextSegment.streamId !== this._fayAudioStreamId) {
      console.log(
        `[LAppModel] Skip stale queued audio: streamId=${nextSegment.streamId}, current=${this._fayAudioStreamId}`
      );
      void this.playNextQueuedFayAudio();
      return;
    }

    console.log(
      `[LAppModel] Audio dequeued: remaining=${this._fayAudioQueue.length}, streamId=${nextSegment.streamId}, text="${nextSegment.text}"`
    );

    this.stopActiveFayAudio(false);
    this._fayAudioPlaying = true;

    const audio = new Audio(nextSegment.url);
    audio.preload = 'auto';
    audio.muted = false;
    audio.volume = 1.0;
    this._activeFayAudio = audio;
    const fallbackTimeoutMs = Math.max(3000, nextSegment.durationMs + 2500);
    let fallbackTimer: number | null = window.setTimeout(() => {
      console.warn(
        `[LAppModel] 网页端音频播放超时兜底触发，强制切换下一段: timeout=${fallbackTimeoutMs}ms`
      );
      cleanup();
    }, fallbackTimeoutMs);

    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      audio.onended = null;
      audio.onerror = null;
      if (this._activeFayAudio === audio) {
        this._activeFayAudio = null;
      }
      this._fayAudioPlaying = false;
      void this.playNextQueuedFayAudio();

      // 如果队列已空且仍在说话状态，自动结束说话（回到待机）
      if (!this._fayAudioPlaying && this._fayAudioQueue.length === 0 && this._frontendSpeaking) {
        this.triggerSpeakingEnd();
      }
    };

    audio.onended = () => {
      console.log('[LAppModel] 网页端音频播放结束');
      cleanup();
    };

    audio.onerror = () => {
      console.error('[LAppModel] 网页端音频播放失败');
      if (this._lipSync) {
        this._lipSync.reset();
      }
      cleanup();
    };

    try {
      await audio.play();
      console.log(`[LAppModel] 网页端开始播放音频: ${nextSegment.text}`);
      this.hideAudioUnlockButton();

      if (this._lipSync) {
        this._lipSync.startLipSync(nextSegment.lips, () => {
          if (this._activeFayAudio !== audio) {
            return null;
          }

          const audioDurationMs =
            Number.isFinite(audio.duration) && audio.duration > 0
              ? audio.duration * 1000
              : 0;

          if (audioDurationMs > 0 && nextSegment.durationMs > 0) {
            return (
              (audio.currentTime * 1000) / audioDurationMs
            ) * nextSegment.durationMs;
          }

          return audio.currentTime * 1000;
        });
      }
    } catch (error) {
      if (this.isAutoplayBlockedError(error)) {
        console.warn(
          `[LAppModel] 网页端音频播放被浏览器拦截，等待下一次用户交互后重试。queue=${this._fayAudioQueue.length + 1}`,
          error
        );
        this._fayAudioQueue.unshift(nextSegment);
        this._fayAudioBlockedByAutoplay = true;
        this._fayAudioPlaying = false;
        this.showAudioUnlockButton();
        if (this._activeFayAudio === audio) {
          this._activeFayAudio = null;
        }
      } else {
        console.error('[LAppModel] 网页端音频播放失败（非自动播放拦截），跳过当前分片继续', error);
        cleanup();
      }
    }
  }

  private stopActiveFayAudio(clearQueue: boolean): void {
    if (clearQueue) {
      this._fayAudioQueue = [];
      this._fayAudioBlockedByAutoplay = false;
      this.hideAudioUnlockButton();
    }

    if (this._activeFayAudio) {
      const audio = this._activeFayAudio;
      this._activeFayAudio = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    this._fayAudioPlaying = false;
  }

  private startConfiguredMotion(
    motionGroup: string,
    motionNo: number,
    source: string,
    priority: number = LAppDefine.PriorityForce
  ): boolean {
    // 取消平滑回归过渡，让新动作从当前姿态自然启动
    this._returnToDefaultActive = false;
    this._returnToDefaultFrom = null;

    // 标记非 Idle 状态，防止 Idle 切换计时器干扰
    this._currentIdleMotionNo = -1;

    // 不调用 stopAllMotions，让 SDK 自动交叉淡入淡出（FadeIn/FadeOut 各 0.5s）
    let resolvedGroup = motionGroup || LAppDefine.MotionGroupTapBody;
    let motionCount = this._modelSetting.getMotionCount(resolvedGroup);

    if (motionCount === 0 && resolvedGroup !== LAppDefine.MotionGroupTapBody) {
      resolvedGroup = LAppDefine.MotionGroupTapBody;
      motionCount = this._modelSetting.getMotionCount(resolvedGroup);
    }

    if (motionCount === 0) {
      console.warn(`[LAppModel] No motion available for ${source}`);
      return false;
    }

    let targetMotionNo = Math.max(0, motionNo - 1);
    if (targetMotionNo < 0 || targetMotionNo >= motionCount) {
      console.warn(
        `[LAppModel] Motion out of range for ${source}: ${motionNo}, fallback to 1`
      );
      targetMotionNo = 0;
    }

    const motionName = `${resolvedGroup}_${targetMotionNo}`;
    const isLoaded = this._motions.getValue(motionName) !== null;
    if (!isLoaded) {
      console.warn(`[LAppModel] Motion ${motionName} was not preloaded`);
    }

    const motionHandle = this.startMotion(
      resolvedGroup,
      targetMotionNo,
      priority
    );
    if (motionHandle === InvalidMotionQueueEntryHandleValue) {
      console.error(
        `[LAppModel] Failed to start motion for ${source}: ${motionName}`
      );
      return false;
    }

    console.log(`[LAppModel] Motion started for ${source}: ${motionName}`);
    return true;
  }

  private applyActionMotion(action?: FayAction): boolean {
    const binding = resolveActionMotion(action);
    const motionNo = resolveActionMotionNo(action);

    if (!binding || motionNo === null) {
      return false;
    }

    return this.startConfiguredMotion(
      binding.group,
      motionNo,
      action?.code || 'action'
    );
  }

  private applyActionExpression(action?: FayAction): boolean {
    const expressionName = resolveActionExpression(action);
    if (!expressionName) {
      return false;
    }

    this.setExpression(expressionName);
    console.log(
      `[LAppModel] Expression applied from semantic action ${action?.code}: ${expressionName}`
    );
    return true;
  }

  /**
   * 初始化Fay集成
   * 连接到Fay WebSocket并在网页端同步播放音频与嘴型
   */
  public initFayIntegration(): void {
    if (this._fayClient) {
      return;
    }

    console.log('[LAppModel] 初始化Fay集成（网页端同步播放音频并驱动口型）');

    // 创建LipSync实例，传入回调函数设置嘴型值
    this._lipSync = new LipSync((value: number) => {
      // ⚠️ 重要：使用 setParameterValueById（绝对设置）而不是 addParameterValueById（相对添加）
      // 这样可以确保口型同步值覆盖表情设置，防止表情影响嘴型
      if (value > 0.1) {
        console.log(`[LipSync] 设置嘴型参数值: ${value.toFixed(2)}`);
      }
      this._model.setParameterValueById(this._idParamMouthOpenY, value);
    });

    // 创建Fay客户端（使用"User"作为username，与Fay默认用户名匹配）
    this._fayClient = new FayClient('ws://127.0.0.1:10002', 'User');

    // 设置消息回调
    this._fayClient.onMessage((message) => {
      console.log('[LAppModel] 收到Fay消息:', JSON.stringify(message, null, 2));

      if (message.Data && message.Data.Lips) {
        /*
        console.log(`[LAppModel] ✓ 收到嘴型数据，文字: "${message.Data.Text}", 嘴型数据: ${message.Data.Lips.length}个`);

        // ========== 动作控制：优先级 关键词 > 情感 > 随机 ==========
        // 1. 优先使用关键词指定动作
        const standardActionMotionApplied = this.applyStandardActionMotion(
        //   message.Data.Action
        // );
        // const standardActionExpressionApplied = this.applyStandardActionExpression(
        //   message.Data.Action
        // );

        const standardActionMotionApplied = this.applyStandardActionMotion(
          message.Data.Action
        );
        const standardActionExpressionApplied = this.applyStandardActionExpression(
          message.Data.Action
        );

        if (!standardActionMotionApplied && message.Data.MotionNo !== undefined) {
          let motionGroup = message.Data.MotionGroup || '';
          let motionCount = this._modelSetting.getMotionCount(motionGroup);

          // ✅ 如果指定组为空或没有动作，尝试使用 TapBody 组作为fallback
          if (motionCount === 0) {
            console.warn(`[LAppModel] ⚠️ 动作组"${motionGroup}"为空，尝试使用TapBody组`);
            motionGroup = LAppDefine.MotionGroupTapBody;
            motionCount = this._modelSetting.getMotionCount(motionGroup);
          }

          console.log(`[LAppModel] 🎯 关键词动作: [组"${motionGroup}", 动作${message.Data.MotionNo}/${motionCount}]`);

          // 如果还是没有动作，跳过
          if (motionCount === 0) {
            console.error(`[LAppModel] ❌ 所有动作组都为空，无法播放动作`);
            return;
          }

          // ✅ 验证动作编号是否在有效范围内
          let targetMotionNo = Math.max(0, message.Data.MotionNo - 1);
          if (targetMotionNo < 0 || targetMotionNo >= motionCount) {
            console.error(`[LAppModel] ❌ 动作编号越界: ${targetMotionNo}，有效范围: 0-${motionCount - 1}，使用动作0`);
            targetMotionNo = 0; // 使用第一个动作作为fallback
          }

          // 验证动作是否已预加载
          const motionName = `${motionGroup}_${targetMotionNo}`;
          const isLoaded = this._motions.getValue(motionName) !== null;
          console.log(`[LAppModel] 动作 ${motionName} 已预加载: ${isLoaded}`);

          if (!isLoaded) {
            console.warn(`[LAppModel] ⚠️ 动作 ${motionName} 未预加载，尝试动态加载`);
          }

          // 关键词动作需要能够打断 Idle，否则对话期间几乎不会看到动作反馈。
          this._motionManager.stopAllMotions();
          const motionHandle = this.startMotion(motionGroup, targetMotionNo, LAppDefine.PriorityForce);
          if (motionHandle === InvalidMotionQueueEntryHandleValue) {
            console.error(`[LAppModel] ❌ 动作启动失败: [组"${motionGroup}", 动作${targetMotionNo}]`);
          } else {
            console.log(`[LAppModel] ✓ 动作已启动: Handle=${motionHandle}`);
          }
        }
        // 2. 没有关键词，使用情感匹配动作
        else if (!standardActionMotionApplied && message.Data.Sentiment !== undefined) {
          this.setMotionBySentiment(message.Data.Sentiment);
        }
        // 3. 都没有，保持当前的随机待机（不干预）

        // ========== 情感 → 表情映射 ==========
        // ⚠️ 注意：使用 setParameterValueById（绝对设置）确保口型同步覆盖表情对嘴部的影响
        if (!standardActionExpressionApplied && message.Data.Sentiment !== undefined) {
          this.setExpressionBySentiment(message.Data.Sentiment);
        }

        // ========== 对话结束时的动作复位 ==========
        */
        const actionMotionApplied = this.applyActionMotion(
          message.Data.Action
        );
        const actionExpressionApplied = this.applyActionExpression(
          message.Data.Action
        );
        const legacyMotionApplied =
          !actionMotionApplied &&
          message.Data.MotionNo !== undefined &&
          this.startConfiguredMotion(
            message.Data.MotionGroup || LAppDefine.MotionGroupTapBody,
            message.Data.MotionNo,
            'legacy-motion'
          );

        if (
          !actionMotionApplied &&
          !legacyMotionApplied &&
          message.Data.Sentiment !== undefined
        ) {
          this.setMotionBySentiment(message.Data.Sentiment);
        }

        if (
          !actionExpressionApplied &&
          message.Data.Sentiment !== undefined
        ) {
          this.setExpressionBySentiment(message.Data.Sentiment);
        }

        if (message.Data.IsEnd === 1) {
          // 让当前动作自然播放完成，不强行打断
          // 待机时不再启动新动作，仅眨眼+呼吸
          this.setExpression('F01');
        }

        // ========== 网页端音频与嘴型同步 ==========
        this.queueFayAudio(message);
      } else {
        console.warn('[LAppModel] 收到消息但没有Lips数据');
      }
    });

    // 设置连接成功回调
    this._fayClient.onConnected(() => {
      console.log('[LAppModel] ✓ Fay WebSocket连接成功');
    });

    // 设置断开连接回调
    this._fayClient.onDisconnected(() => {
      console.log('[LAppModel] ✗ Fay WebSocket断开连接');
    });

    document.addEventListener('pointerdown', this.handleFayAudioUserGesture, {
      passive: true
    });
    document.addEventListener('click', this.handleFayAudioUserGesture, {
      passive: true
    });
    document.addEventListener('keydown', this.handleFayAudioUserGesture);
    document.addEventListener('visibilitychange', this.handleFayAudioVisibilityChange);
    if (this._fayAudioRecoveryTimer === null) {
      this._fayAudioRecoveryTimer = window.setInterval(() => {
        this.resumeQueuedFayAudio('heartbeat');
      }, 1000);
    }

    // 连接到Fay
    this._fayClient.connect();

    // 暴露全局引用，供TouristChat直接控制数字人动作与表情
    (window as any).__live2dModel = this;
    console.log('[LAppModel] 已暴露全局引用 window.__live2dModel');
  }

  /**
   * 将模型所有参数恢复到加载时的默认值，消除动作残留
   */
  private restoreDefaultParameters(): void {
    if (!this._defaultParameters || !this._model) return;
    const count = Math.min(this._model.getParameterCount(), this._defaultParameters.length);
    for (let i = 0; i < count; i++) {
      this._model.setParameterValueByIndex(i, this._defaultParameters[i]);
    }
  }

  /**
   * 开始说话：触发欢迎/点头动作 + 表情
   * 供 TouristChat 在流式回答开始时调用
   */
  public triggerSpeakingStart(): void {
    console.log('[LAppModel] triggerSpeakingStart');
    this._frontendSpeaking = true;
    this._mouthPhase = 0;
    // 不调用 stopAllMotions，SDK 自动交叉淡入淡出
    const motions = [1, 3, 4, 22, 23]; // 点头/微笑/开心/讲解
    const motionNo = motions[Math.floor(Math.random() * motions.length)];
    this.startConfiguredMotion(LAppDefine.MotionGroupTapBody, motionNo, 'speaking-start');
    this.setExpression('F01');
  }

  /**
   * 根据回答文本分析语义，设置加权动作上下文
   * 供 TouristChat 传入完整回答文本，让动作匹配内容
   */
  public setSpeakingContext(text: string): void {
    if (!text || text.length < 3) return;
    this._speakingMotionScores = analyzeResponseForMotions(text);
    console.log('[LAppModel] 回答语义分析完成，动作权重已更新');
  }

  /**
   * 结束说话：恢复到默认表情
   * 供 TouristChat 在流式回答结束时调用
   */
  public triggerSpeakingEnd(): void {
    console.log('[LAppModel] triggerSpeakingEnd');
    this._frontendSpeaking = false;
    this.unbindTtsAudio();
    this.setExpression('F01');
  }

  /**
   * 手动设置口型开合度（0-1）
   * 供 TouristChat 在流式输出时模拟口型变化
   */
  public setMouthOpen(value: number): void {
    if (this._idParamMouthOpenY) {
      this._model.setParameterValueById(this._idParamMouthOpenY, Math.min(1, Math.max(0, value)));
    }
  }

  /**
   * 播放 TTS 音频并实时分析音量驱动口型
   * 每次创建全新 <audio> 避免 createMediaElementSource 单次绑定的限制
   */
  public playTtsAudio(url: string, onEnded?: () => void): void {
    this.unbindTtsAudio();
    this._frontendSpeaking = true;

    try {
      const ctx = new AudioContext();
      this._ttsAudioContext = ctx;
      if (ctx.state === 'suspended') ctx.resume();

      const audio = new Audio(url);
      audio.preload = 'auto';

      const source = ctx.createMediaElementSource(audio);
      this._ttsAudioSource = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      this._ttsAnalyser = analyser;
      this._ttsDataArray = new Uint8Array(analyser.frequencyBinCount);

      source.connect(analyser);
      analyser.connect(ctx.destination);

      audio.onended = () => {
        console.log('[LAppModel] TTS 播放结束');
        this._frontendSpeaking = false;
        this.unbindTtsAudio();
        this.setExpression('F01');
        onEnded?.();
      };

      audio.onerror = () => {
        console.warn('[LAppModel] TTS 播放失败');
        this._frontendSpeaking = false;
        this.unbindTtsAudio();
        this.setExpression('F01');
        onEnded?.();
      };

      audio.play().catch((e) => {
        console.warn('[LAppModel] TTS 自动播放被拦截，重试:', e);
        // 浏览器可能拦截自动播放，延迟重试
        setTimeout(() => audio.play().catch(() => {}), 100);
      });

      console.log('[LAppModel] TTS 音频开始播放（音频分析已启用）');
    } catch (e) {
      console.warn('[LAppModel] TTS 音频分析启动失败，使用节奏模拟:', e);
      // 音频分析不可用时仍保持 _frontendSpeaking=true，fallback 到节奏模拟
      this.unbindTtsAudio();
    }
  }

  /**
   * 解绑 TTS 音频分析器
   */
  public unbindTtsAudio(): void {
    if (this._ttsAudioSource) {
      try { this._ttsAudioSource.disconnect(); } catch (_) { /* */ }
      this._ttsAudioSource = null;
    }
    if (this._ttsAnalyser) {
      try { this._ttsAnalyser.disconnect(); } catch (_) { /* */ }
      this._ttsAnalyser = null;
    }
    if (this._ttsAudioContext && this._ttsAudioContext.state !== 'closed') {
      try { this._ttsAudioContext.close(); } catch (_) { /* */ }
      this._ttsAudioContext = null;
    }
    this._ttsDataArray = null;
  }

  /**
   * 根据情感值设置表情
   * @param sentiment 情感值：-2(非常消极) ~ +2(非常积极)
   */
  private setExpressionBySentiment(sentiment: number): void {
    // 导游人设：始终保持专业微笑，不露负面/过度情绪
    let expressionName: string;

    if (sentiment >= 1) {
      expressionName = 'F05'; // 非常积极：开心的闭眼笑
    } else {
      expressionName = 'F01'; // 其他：温和微笑
    }

    this.setExpression(expressionName);
  }

  /**
   * 根据情感值设置动作
   * @param sentiment 情感值：-2(非常消极) ~ +2(非常积极)
   *
   * 精准映射：每个动作都有明确的使用场景
   */
  private setMotionBySentiment(sentiment: number): void {
    let motionNo: number | null = null;
    let motionDesc = '';

    // 获取TapBody组的动作总数
    const motionCount = this._modelSetting.getMotionCount(LAppDefine.MotionGroupTapBody);

    if (motionCount === 0) {
      console.log(`[LAppModel] 情感值 ${sentiment} → TapBody组为空，不使用动作`);
      return;
    }

    // ✅ 精准映射：根据情感强度和类型选择合适的动作
    // 动作分类（需要根据实际测试调整）：
    // m01-m05: 基础动作（点头、微笑等）
    // m06-m10: 互动动作（庆祝、疑问等）
    // m11-m15: 思考动作
    // m16-m20: 情绪化动作（悲伤、开心等）
    // m21-m26: 特殊动作

    if (sentiment >= 1.5) {
      // 非常积极：庆祝、欢呼类动作
      motionNo = this.getRandomMotion([6, 13]); // m06: 庆祝, m13: 欢呼
      motionDesc = '非常开心（庆祝）';
    } else if (sentiment >= 0.8) {
      // 积极：点头、微笑类动作
      motionNo = this.getRandomMotion([1, 3, 4]); // m01: 点头, m03: 微笑, m04: 开心
      motionDesc = '开心（点头微笑）';
    } else if (sentiment >= 0.3) {
      // 轻微积极：基础肯定动作
      motionNo = 1; // m01: 点头
      motionDesc = '肯定（点头）';
    } else if (sentiment <= -1.5) {
      // 非常消极：悲伤、沮丧类动作
      motionNo = this.getRandomMotion([8, 15]); // m08: 摇头, m15: 沮丧
      motionDesc = '非常消极（沮丧）';
    } else if (sentiment <= -0.8) {
      // 消极：否定、不满类动作
      motionNo = 8; // m08: 摇头
      motionDesc = '否定（摇头）';
    } else if (sentiment <= -0.3) {
      // 轻微消极：轻微不满
      motionNo = this.getRandomMotion([2, 7]); // m02: 不同意, m07: 皱眉
      motionDesc = '轻微不满';
    } else {
      // 中性：不使用特殊动作，保持Idle状态
      motionNo = null;
      motionDesc = '中性';
    }

    // 设置动作
    if (motionNo !== null && motionNo > 0 && motionNo <= motionCount) {
      const targetMotionIndex = motionNo - 1;
      const motionLabel = motionNo < 10 ? `0${motionNo}` : `${motionNo}`;
      console.log(`[LAppModel] 😊 情感值 ${sentiment} → 动作 m${motionLabel}/${motionCount} (${motionDesc})`);
      this._motionManager.stopAllMotions();
      this.startMotion(LAppDefine.MotionGroupTapBody, targetMotionIndex, LAppDefine.PriorityForce);
    } else {
      console.log(`[LAppModel] 情感值 ${sentiment} → ${motionDesc}，保持Idle状态`);
    }
  }

  /**
   * 从候选列表中随机选择一个动作编号
   */
  private getRandomMotion(candidates: number[]): number {
    if (candidates.length === 0) return 0;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * 断开Fay连接
   */
  public disconnectFay(): void {
    document.removeEventListener('pointerdown', this.handleFayAudioUserGesture);
    document.removeEventListener('click', this.handleFayAudioUserGesture);
    document.removeEventListener('keydown', this.handleFayAudioUserGesture);
    document.removeEventListener('visibilitychange', this.handleFayAudioVisibilityChange);
    if (this._fayAudioRecoveryTimer !== null) {
      clearInterval(this._fayAudioRecoveryTimer);
      this._fayAudioRecoveryTimer = null;
    }
    this.hideAudioUnlockButton();

    if (this._fayClient) {
      this._fayClient.disconnect();
      this._fayClient = null;
      console.log('[LAppModel] Fay连接已断开');
    }

    this.stopActiveFayAudio(true);

    if (this._lipSync) {
      this._lipSync.reset();
      this._lipSync = null;
    }
  }

  public release(): void {
    this.disconnectFay();
    super.release();
  }
}
